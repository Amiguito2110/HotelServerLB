import { Request, Response } from 'express';
import pool from '../database';

// SEGURIDAD [CAR-VAL-01]: validación estricta de identificadores y cantidades.
function idSeguro(value: unknown): number | null {
    if (typeof value !== 'number' && typeof value !== 'string') return null;
    const raw = String(value);
    if (!/^[1-9]\d*$/.test(raw)) return null;
    const n = Number(raw);
    return Number.isSafeInteger(n) ? n : null;
}

function fechaISO(value: unknown): string | null {
    if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
    const y = Number(value.substring(0, 4));
    if (y < 1000 || y > 9999) return null;
    const date = new Date(value + 'T00:00:00.000Z');
    return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value ? value : null;
}

type Rango = { inicio: string; fin: string; noches: number };
type Detalle = { id: number; cantidad: number };

function validarRango(inicio: unknown, fin: unknown): Rango | null {
    const desde = fechaISO(inicio);
    const hasta = fechaISO(fin);
    if (!desde || !hasta) return null;
    const noches = (Date.parse(hasta + 'T00:00:00Z') - Date.parse(desde + 'T00:00:00Z')) / 86400000;
    if (!Number.isSafeInteger(noches) || noches < 1 || noches > 365) return null;
    return { inicio: desde, fin: hasta, noches };
}

function validarDetalles(data: unknown): Detalle[] | null {
    if (!Array.isArray(data) || data.length < 1 || data.length > 20) return null;
    const lista: Detalle[] = [];
    const usados = new Set<number>();
    for (const item of data) {
        if (!item || typeof item !== 'object' || Array.isArray(item)) return null;
        const id = idSeguro(item.IDHabitacion);
        const cantidad = idSeguro(item.CantidadHabitaciones);
        if (id === null || cantidad === null || cantidad > 1000 || usados.has(id)) return null;
        usados.add(id);
        lista.push({ id, cantidad });
    }
    return lista.sort((a, b) => a.id - b.id);
}

function precioEnCentavos(value: unknown): number | null {
    const str = String(value);
    if (!/^\d{1,8}(?:\.\d{1,2})?$/.test(str)) return null;
    const partes = str.split('.');
    const total = Number(partes[0]) * 100 + Number(((partes[1] || '') + '00').substring(0, 2));
    return Number.isSafeInteger(total) ? total : null;
}

function cuentaAutenticada(res: Response): number | null {
    // SEGURIDAD [CAR-AUTH-01]: procede exclusivamente del JWT validado.
    const id = res.locals.usuarioAutenticado?.idCuenta;
    return typeof id === 'number' && Number.isSafeInteger(id) && id > 0 ? id : null;
}

function errorBD(res: Response, context: string, error: any): void {
    // SEGURIDAD [CAR-ERR-01]: nunca devolver SQL/stack al navegador.
    console.error(`[Carrito] ${context}: ${String(error?.code || 'ERROR_DESCONOCIDO')}`);
    if (error?.code === 'ER_LOCK_DEADLOCK' || error?.code === 'ER_LOCK_WAIT_TIMEOUT') {
        res.status(409).json({ mensaje: 'Conflicto temporal de datos. Intenta nuevamente.' });
    } else {
        res.status(500).json({ mensaje: 'Error interno del servidor.' });
    }
}

// Verifica disponibilidad real de TODAS las noches [entrada, salida).
// Los artículos del carrito no apartan inventario: la compra debe volver a validar.
async function cotizarYVerificar(
    conexion: any,
    rango: Rango,
    detalles: Detalle[]
): Promise<{ disponible: boolean; centavos: number }> {
    if (!detalles.length) return { disponible: false, centavos: 0 };

    const marcadores = detalles.map(() => '?').join(', ');
    const filas = await conexion.query(
        `SELECT h.IDHabitacion, h.Costo, h.TotalTipoHabitacion,
                COUNT(DISTINCT d.Fecha) AS Dias,
                MIN(d.TotalHabitacionesDisponibles) AS MinDisponibles
         FROM habitaciones AS h
         LEFT JOIN disponibilidadporfecha AS d
           ON d.IDTipoHabitacion = h.IDHabitacion
          AND d.Fecha >= ? AND d.Fecha < ?
         WHERE h.IDHabitacion IN (${marcadores})
         GROUP BY h.IDHabitacion, h.Costo, h.TotalTipoHabitacion`,
        [rango.inicio, rango.fin, ...detalles.map(d => d.id)]
    );

    const porId = new Map<number, any>();
    for (const fila of filas) porId.set(Number(fila.IDHabitacion), fila);

    let total = 0;
    for (const detalle of detalles) {
        const fila = porId.get(detalle.id);
        if (!fila) return { disponible: false, centavos: 0 };
        const precio = precioEnCentavos(fila.Costo);
        if (precio === null) throw new Error('CAR_COSTO_INVALIDO_EN_BD');
        const capacidad = Number(fila.TotalTipoHabitacion);
        if (capacidad < detalle.cantidad || Number(fila.Dias) !== rango.noches ||
            Number(fila.MinDisponibles) < detalle.cantidad) {
            return { disponible: false, centavos: 0 };
        }
        total += precio * detalle.cantidad * rango.noches;
        if (!Number.isSafeInteger(total) || total > 9999999999) {
            throw new Error('CAR_TOTAL_FUERA_DE_RANGO');
        }
    }
    return { disponible: true, centavos: total };
}

// SEGURIDAD [CAR-OWNER-01]: :id es IDCarrito; su propietario se verifica en SQL.
async function verificarPropiedadCarrito(
    conexion: any, idCarrito: number, idCuenta: number, res: Response, bloquear: boolean = false
): Promise<boolean> {
    const filas = await conexion.query(
        `SELECT IDCuenta FROM carritoreservaciones WHERE IDCarrito = ? LIMIT 1${bloquear ? ' FOR UPDATE' : ''}`,
        [idCarrito]
    );
    if (!Array.isArray(filas) || filas.length === 0) {
        res.status(404).json({ mensaje: 'Carrito no encontrado.' });
        return false;
    }
    if (Number(filas[0].IDCuenta) !== idCuenta) {
        res.status(403).json({ mensaje: 'Acceso denegado.' });
        return false;
    }
    return true;
}

function validarCuentaRuta(req: Request, res: Response): number | null {
    const auth = cuentaAutenticada(res);
    if (auth === null) { res.status(401).json({ mensaje: 'Autenticación requerida.' }); return null; }
    const solicitada = idSeguro(req.params.id);
    if (solicitada === null) { res.status(400).json({ mensaje: 'ID de cuenta inválido.' }); return null; }
    if (auth !== solicitada) { res.status(403).json({ mensaje: 'Acceso denegado.' }); return null; }
    return auth;
}

function validarIdCarrito(req: Request, res: Response): number | null {
    const id = idSeguro(req.params.id);
    if (id === null) res.status(400).json({ mensaje: 'ID de carrito inválido.' });
    return id;
}

export class CarritoController {
    // SEGURIDAD [CAR-ASYNC-01]: sin forEach(async); se espera a todas las escrituras.
    // COMPATIBILIDAD: GET heredado cambia disponible; en una futura versión debe ser POST.
    public async filtrar_carrito(req: Request, res: Response): Promise<void> {
        const idCuenta = validarCuentaRuta(req, res);
        if (idCuenta === null) return;
        let conexion: any;
        let enTransaccion = false;
        try {
            conexion = await pool.getConnection();
            await conexion.beginTransaction(); enTransaccion = true;
            const carritos = await conexion.query(
                `SELECT DATE_FORMAT(FechaEntrada, '%Y-%m-%d') AS FechaEntrada,
                        DATE_FORMAT(FechaSalida, '%Y-%m-%d') AS FechaSalida,
                        IDCarrito, IDCuenta, CostoTotal, disponible
                 FROM carritoreservaciones WHERE IDCuenta = ? ORDER BY IDCarrito DESC FOR UPDATE`,
                [idCuenta]
            );

            const today = await conexion.query("SELECT DATE_FORMAT(CURDATE(), '%Y-%m-%d') AS Hoy");
            const hoy = String(today[0].Hoy);
            for (const carrito of carritos) {
                const detallesRows = await conexion.query(
                    'SELECT IDHabitacion, CantidadHabitaciones FROM detallecarrito WHERE IDCarrito = ?',
                    [carrito.IDCarrito]
                );
                const detalles = validarDetalles(detallesRows);
                const fechas = validarRango(carrito.FechaEntrada, carrito.FechaSalida);
                const valido = !!fechas && fechas.inicio >= hoy && !!detalles &&
                    (await cotizarYVerificar(conexion, fechas, detalles)).disponible;
                const nuevo = valido ? 1 : 0;
                if (Number(carrito.disponible) !== nuevo) {
                    await conexion.query(
                        'UPDATE carritoreservaciones SET disponible = ? WHERE IDCarrito = ? AND IDCuenta = ?',
                        [nuevo, carrito.IDCarrito, idCuenta]
                    );
                }
                carrito.disponible = nuevo;
            }
            await conexion.commit(); enTransaccion = false;
            res.json(carritos);
        } catch (error) {
            if (enTransaccion && conexion) { try { await conexion.rollback(); } catch (_) { /* registro principal */ } }
            errorBD(res, 'filtrar_carrito', error);
        } finally {
            if (conexion) conexion.release();
        }
    }

    // SEGURIDAD [CAR-AUTH-02, CAR-SQL-01]: el IDCuenta se obtiene del token.
    // El importe se recalcula con los precios de MySQL, no desde req.body.CostoTotal.
    public async agregar_carrito(req: Request, res: Response): Promise<void> {
        const idCuenta = cuentaAutenticada(res);
        if (idCuenta === null) { res.status(401).json({ mensaje: 'Autenticación requerida.' }); return; }
        const body = req.body || {};
        if (body.IDCuenta !== undefined && idSeguro(body.IDCuenta) !== idCuenta) {
            res.status(403).json({ mensaje: 'No puedes agregar carritos a otra cuenta.' }); return;
        }
        const fechas = validarRango(body.FechaEntrada, body.FechaSalida);
        const detalles = validarDetalles(body.DetalleCarrito);
        if (!fechas || !detalles) { res.status(400).json({ mensaje: 'Datos del carrito inválidos.' }); return; }

        let conexion: any;
        let enTransaccion = false;
        try {
            conexion = await pool.getConnection();
            const hoyRows = await conexion.query("SELECT DATE_FORMAT(CURDATE(), '%Y-%m-%d') AS Hoy");
            if (fechas.inicio < hoyRows[0].Hoy) {
                res.status(400).json({ mensaje: 'La fecha de entrada ya pasó.' }); return;
            }
            await conexion.beginTransaction(); enTransaccion = true;
            const cotizacion = await cotizarYVerificar(conexion, fechas, detalles);
            if (!cotizacion.disponible) {
                await conexion.rollback(); enTransaccion = false;
                res.status(409).json({ mensaje: 'No hay disponibilidad suficiente para todas las noches.' }); return;
            }
            const insert = await conexion.query(
                `INSERT INTO carritoreservaciones
                    (IDCuenta, FechaEntrada, FechaSalida, CostoTotal, disponible)
                 VALUES (?, ?, ?, ?, 1)`,
                [idCuenta, fechas.inicio, fechas.fin, (cotizacion.centavos / 100).toFixed(2)]
            );
            const idCarrito = Number(insert.insertId);
            for (const detalle of detalles) {
                await conexion.query(
                    'INSERT INTO detallecarrito (IDCarrito, IDHabitacion, CantidadHabitaciones) VALUES (?, ?, ?)',
                    [idCarrito, detalle.id, detalle.cantidad]
                );
            }
            await conexion.commit(); enTransaccion = false;
            res.status(201).json({ IDCarrito: idCarrito });
        } catch (error) {
            if (enTransaccion && conexion) { try { await conexion.rollback(); } catch (_) { /* registro principal */ } }
            errorBD(res, 'agregar_carrito', error);
        } finally {
            if (conexion) conexion.release();
        }
    }

    public async mostrar_carrito(req: Request, res: Response): Promise<void> {
        const idCuenta = validarCuentaRuta(req, res);
        if (idCuenta === null) return;
        try {
            const filas = await pool.query(
                `SELECT DATE_FORMAT(FechaEntrada, '%Y-%m-%d') AS FechaEntrada,
                        DATE_FORMAT(FechaSalida, '%Y-%m-%d') AS FechaSalida,
                        IDCarrito, IDCuenta, CostoTotal
                 FROM carritoreservaciones WHERE IDCuenta = ? AND disponible = 1`,
                [idCuenta]
            );
            res.json(filas);
        } catch (error) { errorBD(res, 'mostrar_carrito', error); }
    }

    public async mostrar_carrito_no_disponibles(req: Request, res: Response): Promise<void> {
        const idCuenta = validarCuentaRuta(req, res);
        if (idCuenta === null) return;
        try {
            const filas = await pool.query(
                `SELECT DATE_FORMAT(FechaEntrada, '%Y-%m-%d') AS FechaEntrada,
                        DATE_FORMAT(FechaSalida, '%Y-%m-%d') AS FechaSalida,
                        IDCarrito, IDCuenta, CostoTotal
                 FROM carritoreservaciones WHERE IDCuenta = ? AND disponible = 0`,
                [idCuenta]
            );
            res.json(filas);
        } catch (error) { errorBD(res, 'mostrar_carrito_no_disponibles', error); }
    }

    public async mostrar_detalle_carrito(req: Request, res: Response): Promise<void> {
        const id = validarIdCarrito(req, res);
        if (id === null) return;
        const auth = cuentaAutenticada(res);
        if (auth === null) { res.status(401).json({ mensaje: 'Autenticación requerida.' }); return; }
        try {
            if (!await verificarPropiedadCarrito(pool, id, auth, res)) return;
            const filas = await pool.query(
                'SELECT IDHabitacion, CantidadHabitaciones FROM detallecarrito WHERE IDCarrito = ?', [id]
            );
            res.json(filas);
        } catch (error) { errorBD(res, 'mostrar_detalle_carrito', error); }
    }

    // SEGURIDAD [CAR-MASS-01]: permitir solo cambios funcionales de fechas y detalles;
    // IDCuenta/disponible no son editables y CostoTotal se recalcula desde MySQL.
    public async actualizar_carrito(req: Request, res: Response): Promise<void> {
        const id = validarIdCarrito(req, res);
        if (id === null) return;
        const auth = cuentaAutenticada(res);
        if (auth === null) { res.status(401).json({ mensaje: 'Autenticación requerida.' }); return; }
        const body = req.body;
        if (!body || typeof body !== 'object' || Array.isArray(body) ||
            Object.keys(body).some(k => !['FechaEntrada', 'FechaSalida', 'DetalleCarrito', 'CostoTotal', 'IDCuenta'].includes(k))) {
            res.status(400).json({ mensaje: 'Campos de actualización no permitidos.' }); return;
        }
        if (body.IDCuenta !== undefined && idSeguro(body.IDCuenta) !== auth) {
            res.status(403).json({ mensaje: 'Acceso denegado.' }); return;
        }
        if (body.FechaEntrada === undefined && body.FechaSalida === undefined && body.DetalleCarrito === undefined) {
            res.status(400).json({ mensaje: 'No hay cambios permitidos.' }); return;
        }
        let conexion: any;
        let enTransaccion = false;
        try {
            conexion = await pool.getConnection();
            await conexion.beginTransaction(); enTransaccion = true;
            if (!await verificarPropiedadCarrito(conexion, id, auth, res, true)) {
                await conexion.rollback(); enTransaccion = false; return;
            }
            const rows = await conexion.query(
                `SELECT DATE_FORMAT(FechaEntrada,'%Y-%m-%d') AS FechaEntrada,
                        DATE_FORMAT(FechaSalida,'%Y-%m-%d') AS FechaSalida
                 FROM carritoreservaciones WHERE IDCarrito = ?`, [id]
            );
            const fechas = validarRango(
                body.FechaEntrada === undefined ? rows[0].FechaEntrada : body.FechaEntrada,
                body.FechaSalida === undefined ? rows[0].FechaSalida : body.FechaSalida
            );
            const originales = body.DetalleCarrito === undefined
                ? await conexion.query('SELECT IDHabitacion, CantidadHabitaciones FROM detallecarrito WHERE IDCarrito = ?', [id])
                : body.DetalleCarrito;
            const detalles = validarDetalles(originales);
            if (!fechas || !detalles) {
                await conexion.rollback(); enTransaccion = false;
                res.status(400).json({ mensaje: 'Datos de actualización inválidos.' }); return;
            }
            const todayRows = await conexion.query("SELECT DATE_FORMAT(CURDATE(), '%Y-%m-%d') AS Hoy");
            if (fechas.inicio < todayRows[0].Hoy) {
                await conexion.rollback(); enTransaccion = false;
                res.status(400).json({ mensaje: 'La fecha de entrada ya pasó.' }); return;
            }
            const quote = await cotizarYVerificar(conexion, fechas, detalles);
            if (!quote.disponible) {
                await conexion.rollback(); enTransaccion = false;
                res.status(409).json({ mensaje: 'No hay disponibilidad suficiente para todas las noches.' }); return;
            }
            await conexion.query(
                `UPDATE carritoreservaciones
                 SET FechaEntrada = ?, FechaSalida = ?, CostoTotal = ?, disponible = 1
                 WHERE IDCarrito = ? AND IDCuenta = ?`,
                [fechas.inicio, fechas.fin, (quote.centavos / 100).toFixed(2), id, auth]
            );
            if (body.DetalleCarrito !== undefined) {
                await conexion.query('DELETE FROM detallecarrito WHERE IDCarrito = ?', [id]);
                for (const detalle of detalles) {
                    await conexion.query(
                        'INSERT INTO detallecarrito (IDCarrito, IDHabitacion, CantidadHabitaciones) VALUES (?, ?, ?)',
                        [id, detalle.id, detalle.cantidad]
                    );
                }
            }
            await conexion.commit(); enTransaccion = false;
            res.json({ mensaje: 'Carrito actualizado correctamente.' });
        } catch (error) {
            if (enTransaccion && conexion) { try { await conexion.rollback(); } catch (_) { /* registro principal */ } }
            errorBD(res, 'actualizar_carrito', error);
        } finally { if (conexion) conexion.release(); }
    }

    // SEGURIDAD [CAR-TRAN-01]: eliminar detalles + cabecera en una transacción.
    public async eliminar_carrito(req: Request, res: Response): Promise<void> {
        const id = validarIdCarrito(req, res);
        if (id === null) return;
        const auth = cuentaAutenticada(res);
        if (auth === null) { res.status(401).json({ mensaje: 'Autenticación requerida.' }); return; }
        let conexion: any;
        let enTransaccion = false;
        try {
            conexion = await pool.getConnection();
            await conexion.beginTransaction(); enTransaccion = true;
            if (!await verificarPropiedadCarrito(conexion, id, auth, res, true)) {
                await conexion.rollback(); enTransaccion = false; return;
            }
            await conexion.query('DELETE FROM detallecarrito WHERE IDCarrito = ?', [id]);
            const result = await conexion.query(
                'DELETE FROM carritoreservaciones WHERE IDCarrito = ? AND IDCuenta = ?', [id, auth]
            );
            await conexion.commit(); enTransaccion = false;
            // Mantener el formato del resultado anterior de MySQL para Angular.
            res.json(result);
        } catch (error) {
            if (enTransaccion && conexion) { try { await conexion.rollback(); } catch (_) { /* registro principal */ } }
            errorBD(res, 'eliminar_carrito', error);
        } finally { if (conexion) conexion.release(); }
    }
}

export const carritoController = new CarritoController();

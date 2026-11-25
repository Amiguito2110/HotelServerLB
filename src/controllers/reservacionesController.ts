import { Request, Response } from 'express';
import pool from '../database';
import { RolUsuario } from '../middleware/autorizarRoles';

// SEGURIDAD [RES-VAL-01]: validaciones independientes de la interfaz Angular.
function idSeguro(valor: unknown): number | null {
    if (typeof valor !== 'string' && typeof valor !== 'number') return null;
    const texto = String(valor);
    if (!/^[1-9]\d*$/.test(texto)) return null;
    const n = Number(texto);
    return Number.isSafeInteger(n) ? n : null;
}
function cantidadSegura(valor: unknown): number | null {
    const n = idSeguro(valor);
    return n !== null && n <= 1000 ? n : null;
}
function fechaISO(valor: unknown): string | null {
    if (typeof valor !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(valor)) return null;
    const anio = Number(valor.slice(0, 4));
    if (anio < 1000 || anio > 9999) return null;
    const d = new Date(valor + 'T00:00:00.000Z');
    return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === valor ? valor : null;
}
function nochesEntre(inicio: string, fin: string): number {
    const noches = (Date.parse(fin + 'T00:00:00.000Z') - Date.parse(inicio + 'T00:00:00.000Z')) / 86400000;
    return Number.isSafeInteger(noches) ? noches : -1;
}
function rango(body: any): { inicio: string; fin: string; noches: number } | null {
    const inicio = fechaISO(body?.FechaUno ?? body?.FechaEntrada);
    const fin = fechaISO(body?.FechaDos ?? body?.FechaSalida);
    if (!inicio || !fin) return null;
    const noches = nochesEntre(inicio, fin);
    if (noches < 1 || noches > 365) return null;
    return { inicio, fin, noches };
}
function horaSegura(valor: unknown): string | null {
    if (typeof valor !== 'string' || !/^(?:[01]\d|2[0-3]):[0-5]\d(?::[0-5]\d)?$/.test(valor)) return null;
    return valor.length === 5 ? valor + ':00' : valor;
}
function objeto(valor: any): any {
    return valor && typeof valor === 'object' && !Array.isArray(valor) ? valor : {};
}
function detallesValidos(valor: unknown): Array<{ id: number; cantidad: number }> | null {
    if (!Array.isArray(valor) || valor.length < 1 || valor.length > 20) return null;
    const detalles: Array<{ id: number; cantidad: number }> = [];
    const ids = new Set<number>();
    for (const entrada of valor) {
        const id = idSeguro(objeto(entrada).IDHabitacion);
        const cantidad = cantidadSegura(objeto(entrada).CantidadHabitaciones);
        if (id === null || cantidad === null || ids.has(id)) return null;
        ids.add(id);
        detalles.push({ id, cantidad });
    }
    // SEGURIDAD [RES-TRAN-02]: adquirir bloqueos siempre en orden consistente.
    return detalles.sort((a, b) => a.id - b.id);
}
function centavos(valor: unknown): number | null {
    const s = String(valor);
    if (!/^\d{1,8}(?:\.\d{1,2})?$/.test(s)) return null;
    const [entero, decimal = ''] = s.split('.');
    const resultado = Number(entero) * 100 + Number((decimal + '00').slice(0, 2));
    return Number.isSafeInteger(resultado) ? resultado : null;
}
function errorBD(res: Response, etiqueta: string, error: any): void {
    const code = error?.code ?? 'ERROR_DESCONOCIDO';
    console.error(`[Reservaciones] ${etiqueta}: ${String(code)}`);
    if (code === 'ER_LOCK_DEADLOCK' || code === 'ER_LOCK_WAIT_TIMEOUT') {
        res.status(409).json({ mensaje: 'Conflicto temporal de disponibilidad. Vuelve a intentar.' });
        return;
    }
    res.status(500).json({ mensaje: 'Error interno del servidor.' });
}
function errorSolicitud(res: Response, texto: string): void {
    res.status(400).json({ mensaje: texto });
}
function esPersonal(rol: number): boolean {
    return rol === RolUsuario.ADMINISTRADOR || rol === RolUsuario.RECEPCIONISTA;
}
function idDeRuta(req: Request, res: Response): number | null {
    const id = idSeguro(req.params.id);
    if (id === null) errorSolicitud(res, 'Identificador inválido.');
    return id;
}

class ReservacionesController {
    // SEGURIDAD [RES-PUB-01]: exigir todas las noches del rango, no solo una fecha.
    private async consultarDisponibilidad(req: Request, res: Response, incluirMinimo: boolean): Promise<void> {
        const fechas = rango(req.body);
        if (!fechas) { errorSolicitud(res, 'Rango de fechas inválido (1 a 365 noches).'); return; }
        try {
            const filas = await pool.query(
                `SELECT h.IDHabitacion, h.TipoHabitacion, h.MaxHuespedes,
                        h.TotalTipoHabitacion, h.Costo,
                        MIN(d.TotalHabitacionesDisponibles) AS MinDisponibles
                 FROM habitaciones AS h
                 INNER JOIN disponibilidadporfecha AS d
                    ON d.IDTipoHabitacion = h.IDHabitacion
                 WHERE d.Fecha >= ? AND d.Fecha < ?
                 GROUP BY h.IDHabitacion, h.TipoHabitacion, h.MaxHuespedes,
                          h.TotalTipoHabitacion, h.Costo
                 HAVING COUNT(DISTINCT d.Fecha) = ?
                    AND MIN(d.TotalHabitacionesDisponibles) > 0
                 ORDER BY h.IDHabitacion`,
                [fechas.inicio, fechas.fin, fechas.noches]
            );
            if (incluirMinimo) { res.json(filas); return; }
            res.json(filas.map((f: any) => ({
                IDHabitacion: f.IDHabitacion,
                TipoHabitacion: f.TipoHabitacion,
                MaxHuespedes: f.MaxHuespedes,
                TotalTipoHabitacion: f.TotalTipoHabitacion,
                Costo: f.Costo
            })));
        } catch (error) { errorBD(res, 'consultar_disponibilidad', error); }
    }
    public mostrar_habitaciones_disponibles_rango_fecha = (req: Request, res: Response): Promise<void> =>
        this.consultarDisponibilidad(req, res, false);
    public mostrar_habitaciones_disponibles_una_fecha = (req: Request, res: Response): Promise<void> =>
        this.consultarDisponibilidad(req, res, false);
    public mostrar_habitaciones_num_disponibilidad = (req: Request, res: Response): Promise<void> =>
        this.consultarDisponibilidad(req, res, true);

    // SEGURIDAD [RES-QUOTE-01]: cotización aproximada por noche; el precio final se recalcula al reservar.
    public async setearCostoTotal(req: Request, res: Response): Promise<void> {
        const detalles = detallesValidos(req.body);
        if (!detalles) { errorSolicitud(res, 'Habitaciones o cantidades inválidas.'); return; }
        try {
            let total = 0;
            for (const detalle of detalles) {
                const filas = await pool.query('SELECT Costo FROM habitaciones WHERE IDHabitacion = ? LIMIT 1', [detalle.id]);
                if (!filas?.length) { res.status(404).json({ mensaje: 'Habitación no encontrada.' }); return; }
                const precio = centavos(filas[0].Costo);
                if (precio === null) { res.status(500).json({ mensaje: 'Precio de habitación inválido.' }); return; }
                total += precio * detalle.cantidad;
            }
            if (total > 9999999999) { errorSolicitud(res, 'Importe fuera de rango.'); return; }
            res.json({ costoTotal: total / 100 });
        } catch (error) { errorBD(res, 'setearCostoTotal', error); }
    }

    // SEGURIDAD [RES-TRAN-01, RES-SQL-01]: una sola conexión y transacción para toda la reserva.
    public async hacer_reservacion_2(req: Request, res: Response): Promise<void> {
        const body = objeto(req.body);
        const fechas = rango(body);
        const detalles = detallesValidos(body.detallesReserva);
        const hora = horaSegura(body.HoraLlegada);
        const idCuenta = idSeguro(body.IDCuenta);
        const autenticado = res.locals.usuarioAutenticado;
        if (!autenticado || !Number.isSafeInteger(autenticado.idCuenta) || !autenticado.rol) {
            res.status(401).json({ mensaje: 'Autenticación requerida.' }); return;
        }
        if (!fechas || !detalles || !hora || idCuenta === null) {
            errorSolicitud(res, 'Datos de reservación inválidos.'); return;
        }
        // SEGURIDAD [RES-AUTH-05]: el cliente no elige la cuenta de otra persona.
        if (!esPersonal(autenticado.rol) && idCuenta !== autenticado.idCuenta) {
            res.status(403).json({ mensaje: 'No puedes reservar para otra cuenta.' }); return;
        }
        let conexion: any;
        let transaccion = false;
        try {
            conexion = await pool.getConnection();
            await conexion.beginTransaction();
            transaccion = true;

            // No aceptar reservas pasadas; utilizar la fecha de MySQL.
            const fechaPasada = await conexion.query('SELECT (? < CURDATE()) AS esPasada', [fechas.inicio]);
            if (Number(fechaPasada[0].esPasada) === 1) {
                res.status(400).json({ mensaje: 'No se permiten reservaciones en fechas pasadas.' });
                await conexion.rollback(); transaccion = false; return;
            }
            const cuentas = await conexion.query('SELECT IDCuenta FROM cuenta WHERE IDCuenta = ? LIMIT 1', [idCuenta]);
            if (!cuentas?.length) {
                await conexion.rollback(); transaccion = false;
                res.status(404).json({ mensaje: 'Cuenta no encontrada.' }); return;
            }
            let totalCentavos = 0;
            for (const detalle of detalles) {
                // Bloquear fila de habitación antes de revisar disponibilidad.
                const habitaciones = await conexion.query(
                    'SELECT Costo, TotalTipoHabitacion FROM habitaciones WHERE IDHabitacion = ? FOR UPDATE', [detalle.id]
                );
                if (!habitaciones?.length) {
                    await conexion.rollback(); transaccion = false;
                    res.status(404).json({ mensaje: 'Habitación no encontrada.' }); return;
                }
                const precio = centavos(habitaciones[0].Costo);
                const capacidad = Number(habitaciones[0].TotalTipoHabitacion);
                if (precio === null || !Number.isSafeInteger(capacidad) || detalle.cantidad > capacidad) {
                    await conexion.rollback(); transaccion = false;
                    errorSolicitud(res, 'Cantidad o precio de habitación inválido.'); return;
                }
                const dias = await conexion.query(
                    `SELECT Fecha, TotalHabitacionesDisponibles
                     FROM disponibilidadporfecha
                     WHERE IDTipoHabitacion = ? AND Fecha >= ? AND Fecha < ?
                     ORDER BY Fecha FOR UPDATE`,
                    [detalle.id, fechas.inicio, fechas.fin]
                );
                if (dias.length !== fechas.noches || dias.some((dia: any) => Number(dia.TotalHabitacionesDisponibles) < detalle.cantidad)) {
                    await conexion.rollback(); transaccion = false;
                    res.status(409).json({ mensaje: 'No hay disponibilidad suficiente para todas las noches.' }); return;
                }
                totalCentavos += precio * detalle.cantidad * fechas.noches;
            }
            // DECIMAL(10,2) permite como máximo 99,999,999.99.
            if (!Number.isSafeInteger(totalCentavos) || totalCentavos > 9999999999) {
                await conexion.rollback(); transaccion = false;
                errorSolicitud(res, 'Importe total fuera de rango.'); return;
            }

            const reserva = await conexion.query(
                `INSERT INTO reservaciones
                    (IDCuenta, FechaEntrada, FechaSalida, HoraLlegada, CostoTotal)
                 VALUES (?, ?, ?, ?, ?)`,
                [idCuenta, fechas.inicio, fechas.fin, hora, (totalCentavos / 100).toFixed(2)]
            );
            const idReserva = Number(reserva.insertId);
            for (const detalle of detalles) {
                await conexion.query(
                    `INSERT INTO detallesreservacion
                        (IDReservacion, IDHabitacion, CantidadHabitaciones)
                     VALUES (?, ?, ?)`,
                    [idReserva, detalle.id, detalle.cantidad]
                );
                // SEGURIDAD [RES-DATA-01]: cambio condicionado con verificación por cada noche.
                const actualizado = await conexion.query(
                    `UPDATE disponibilidadporfecha
                     SET TotalHabitacionesDisponibles = TotalHabitacionesDisponibles - ?
                     WHERE IDTipoHabitacion = ? AND Fecha >= ? AND Fecha < ?
                       AND TotalHabitacionesDisponibles >= ?`,
                    [detalle.cantidad, detalle.id, fechas.inicio, fechas.fin, detalle.cantidad]
                );
                if (Number(actualizado.affectedRows) !== fechas.noches) {
                    await conexion.rollback(); transaccion = false;
                    res.status(409).json({ mensaje: 'La disponibilidad cambió. Intenta nuevamente.' }); return;
                }
            }
            
            await conexion.commit(); transaccion = false;
            res.status(201).json({
                reserva: { insertId: idReserva, affectedRows: 1 },
                mensaje: 'Reserva realizada correctamente',
                CostoTotal: Number((totalCentavos / 100).toFixed(2))
            });
        } catch (error) {
            if (transaccion && conexion) {
                try { await conexion.rollback(); } catch (_e) { /* cierre en finally */ }
            }
            errorBD(res, 'hacer_reservacion_2', error);
        } finally {
            if (conexion) conexion.release();
        }
    }

    // SEGURIDAD [RES-LEGACY-01]: endpoint roto e inseguro: no ejecutarlo.
    public async hacer_reservacion(_req: Request, res: Response): Promise<void> {
        res.status(410).json({ mensaje: 'Utiliza hacer_reservacion_2.' });
    }

    // SEGURIDAD [RES-CANCEL-01]: cancelación y reposición atómicas e idempotentes.
    private async cancelar(req: Request, res: Response): Promise<void> {
        const id = idDeRuta(req, res);
        if (id === null) return;
        const identidad = res.locals.usuarioAutenticado;
        let conexion: any;
        let transaccion = false;
        try {
            conexion = await pool.getConnection();
            await conexion.beginTransaction(); transaccion = true;
            const reservas = await conexion.query(
                `SELECT IDCuenta, FechaEntrada, FechaSalida, EstadoReserva, EstadoPago
                 FROM reservaciones WHERE IDReserva = ? FOR UPDATE`, [id]
            );
            if (!reservas.length) {
                await conexion.rollback(); transaccion = false;
                res.status(404).json({ mensaje: 'Reservación no encontrada.' }); return;
            }
            const reserva = reservas[0];
            if (!esPersonal(identidad.rol) && Number(reserva.IDCuenta) !== identidad.idCuenta) {
                await conexion.rollback(); transaccion = false;
                res.status(403).json({ mensaje: 'Acceso denegado.' }); return;
            }
            if (reserva.EstadoReserva === 'Cancelado') {
                await conexion.rollback(); transaccion = false;
                res.status(409).json({ mensaje: 'La reservación ya estaba cancelada.' }); return;
            }
            // Requiere revisión del negocio para cancelar Check-In / Check-Out.
            if (reserva.EstadoReserva === 'Check-In' || reserva.EstadoReserva === 'Check-Out') {
                await conexion.rollback(); transaccion = false;
                res.status(409).json({ mensaje: 'No es posible cancelar una estancia iniciada o finalizada.' }); return;
            }
            // Formatear campos DATE sin depender del huso horario del servidor Node.
            const fechas = await conexion.query(
                `SELECT DATE_FORMAT(FechaEntrada,'%Y-%m-%d') AS inicio,
                        DATE_FORMAT(FechaSalida,'%Y-%m-%d') AS fin
                 FROM reservaciones WHERE IDReserva = ?`, [id]
            );
            const inicio = fechas[0].inicio;
            const fin = fechas[0].fin;
            const noches = nochesEntre(inicio, fin);
            if (noches < 1 || noches > 365) throw new Error('RANGO_INCONSISTENTE');
            const filas = await conexion.query(
                `SELECT IDHabitacion, SUM(CantidadHabitaciones) AS CantidadHabitaciones
                 FROM detallesreservacion WHERE IDReservacion = ?
                 GROUP BY IDHabitacion ORDER BY IDHabitacion`, [id]
            );
            if (!filas.length) throw new Error('DETALLES_INCOMPLETOS');
            for (const detalle of filas) {
                const idHabitacion = Number(detalle.IDHabitacion);
                const cantidad = Number(detalle.CantidadHabitaciones);
                const hab = await conexion.query(
                    'SELECT TotalTipoHabitacion FROM habitaciones WHERE IDHabitacion = ? FOR UPDATE',
                    [idHabitacion]
                );
                if (!hab.length) throw new Error('HABITACION_INEXISTENTE');
                const capacidad = Number(hab[0].TotalTipoHabitacion);
                if (!Number.isSafeInteger(capacidad) || !Number.isSafeInteger(cantidad) || cantidad <= 0) {
                    throw new Error('DATOS_INCONSISTENTES');
                }
                const dias = await conexion.query(
                    `SELECT TotalHabitacionesDisponibles FROM disponibilidadporfecha
                     WHERE IDTipoHabitacion = ? AND Fecha >= ? AND Fecha < ?
                     ORDER BY Fecha FOR UPDATE`, [idHabitacion, inicio, fin]
                );
                if (dias.length !== noches || dias.some((d: any) =>
                    Number(d.TotalHabitacionesDisponibles) + cantidad > capacidad
                )) {
                    await conexion.rollback(); transaccion = false;
                    res.status(409).json({ mensaje: 'Disponibilidad inconsistente; requiere revisión manual.' }); return;
                }
                const actualizado = await conexion.query(
                    `UPDATE disponibilidadporfecha
                     SET TotalHabitacionesDisponibles = TotalHabitacionesDisponibles + ?
                     WHERE IDTipoHabitacion = ? AND Fecha >= ? AND Fecha < ?
                     AND TotalHabitacionesDisponibles <= ?`,
                    [cantidad, idHabitacion, inicio, fin, capacidad - cantidad]
                );
                if (Number(actualizado.affectedRows) !== noches) {
                    await conexion.rollback(); transaccion = false;
                    res.status(409).json({ mensaje: 'No se pudo restituir disponibilidad.' }); return;
                }
            }
            // No afirmar que un pago ya efectuado se reembolsó.
            await conexion.query(
                `UPDATE reservaciones
                 SET EstadoReserva = 'Cancelado',
                     EstadoPago = IF(EstadoPago = 'Pagado', 'Pagado', 'Cancelado')
                 WHERE IDReserva = ?`, [id]
            );
            await conexion.commit(); transaccion = false;
            res.json({ mensaje: 'Reservación cancelada; disponibilidad restituida.' });
        } catch (error) {
            if (transaccion && conexion) {
                try { await conexion.rollback(); } catch (_e) { /* cierre en finally */ }
            }
            errorBD(res, 'cancelar', error);
        } finally {
            if (conexion) conexion.release();
        }
    }
    public cancelar_reservacion = async (req: Request, res: Response): Promise<void> => {
        return this.cancelar(req, res);
    };
    public modificar_estado_reserva = async (req: Request, res: Response): Promise<void> => {
        const id = idDeRuta(req, res);
        if (id === null) return;
        const datos = objeto(req.body);
        const campos = Object.keys(datos);
        if (campos.length === 0 || campos.some(c => ['EstadoReserva', 'EstadoPago'].indexOf(c) === -1)) {
            errorSolicitud(res, 'Solo se pueden modificar estados permitidos.'); return;
        }
        if (datos.EstadoReserva === 'Cancelado') return this.cancelar(req, res);
        if (!esPersonal(res.locals.usuarioAutenticado.rol)) {
            res.status(403).json({ mensaje: 'Solo el personal puede cambiar estados.' }); return;
        }
        const estadosReserva = ['Pendiente', 'Check-In', 'Check-Out'];
        const estadosPago = ['Pendiente', 'Pagado', 'Cancelado'];
        if ((datos.EstadoReserva !== undefined && estadosReserva.indexOf(datos.EstadoReserva) === -1) ||
            (datos.EstadoPago !== undefined && estadosPago.indexOf(datos.EstadoPago) === -1)) {
            errorSolicitud(res, 'Estado no reconocido.'); return;
        }
        try {
            const sets: string[] = [];
            const vals: any[] = [];
            if (datos.EstadoReserva !== undefined) { sets.push('EstadoReserva = ?'); vals.push(datos.EstadoReserva); }
            if (datos.EstadoPago !== undefined) { sets.push('EstadoPago = ?'); vals.push(datos.EstadoPago); }
            const r = await pool.query(
                `UPDATE reservaciones SET ${sets.join(', ')} WHERE IDReserva = ? AND EstadoReserva <> 'Cancelado'`,
                [...vals, id]
            );
            if (Number(r.affectedRows) === 0) {
                res.status(409).json({ mensaje: 'Reservación inexistente o cancelada.' }); return;
            }
            res.json(r);
        } catch (error) { errorBD(res, 'modificar_estado_reserva', error); }
    }
    public async modificar_estado_pago(req: Request, res: Response): Promise<void> {
        // Compatible con la pantalla de recepción; solo altera EstadoPago.
        const id = idDeRuta(req, res);
        if (id === null) return;
        const datos = objeto(req.body);
        if (Object.keys(datos).length !== 1 || ['Pendiente', 'Pagado', 'Cancelado'].indexOf(datos.EstadoPago) === -1) {
            errorSolicitud(res, 'Estado de pago inválido.'); return;
        }
        try {
            const r = await pool.query('UPDATE reservaciones SET EstadoPago = ? WHERE IDReserva = ?', [datos.EstadoPago, id]);
            if (!r.affectedRows) { res.status(404).json({ mensaje: 'Reservación no encontrada.' }); return; }
            res.json(r);
        } catch (error) { errorBD(res, 'modificar_estado_pago', error); }
    }
    public async modificar_reservacion(req: Request, res: Response): Promise<void> {
        // SEGURIDAD [RES-MASS-01]: no permitir actualizar fechas, dueño, costo o pagos por req.body.
        const id = idDeRuta(req, res);
        if (id === null) return;
        const datos = objeto(req.body);
        const hora = horaSegura(datos.HoraLlegada);
        if (Object.keys(datos).length !== 1 || !hora) {
            errorSolicitud(res, 'Solo se permite modificar HoraLlegada.'); return;
        }
        try {
            const r = await pool.query('UPDATE reservaciones SET HoraLlegada = ? WHERE IDReserva = ?', [hora, id]);
            if (!r.affectedRows) { res.status(404).json({ mensaje: 'Reservación no encontrada.' }); return; }
            res.json(r);
        } catch (error) { errorBD(res, 'modificar_reservacion', error); }
    }
    public async actualizar_despues_de_cancelacion(_req: Request, res: Response): Promise<void> {
        // SEGURIDAD [RES-CANCEL-02]: compatibilidad con Angular antiguo; NO actualizar con datos del cliente.
        res.json({ mensaje: 'La disponibilidad se actualiza automáticamente al cancelar.', obsoleto: true });
    }

    public reservas_idUsuario = async (req: Request, res: Response): Promise<void> => {
        return this.listadoCuenta(req, res, false);
    };
    public mostrar_reservaciones_por_IDCuenta = async (req: Request, res: Response): Promise<void> => {
        return this.listadoCuenta(req, res, true);
    };
    private async listadoCuenta(req: Request, res: Response, formatear: boolean): Promise<void> {
        const id = idDeRuta(req, res);
        if (id === null) return;
        try {
            const columnas = formatear
                ? `IDReserva, DATE_FORMAT(FechaEntrada,'%Y-%m-%d') AS FechaEntrada,
                   DATE_FORMAT(FechaSalida,'%Y-%m-%d') AS FechaSalida, EstadoReserva, EstadoPago`
                : `IDReserva, FechaEntrada, FechaSalida, HoraLlegada, EstadoReserva, EstadoPago`;
            const filas = await pool.query(`SELECT ${columnas} FROM reservaciones WHERE IDCuenta = ? ORDER BY FechaEntrada DESC`, [id]);
            res.json(filas);
        } catch (error) { errorBD(res, 'listadoCuenta', error); }
    }
    public async mostrar_detalles_reservacion(req: Request, res: Response): Promise<void> {
        const id = idDeRuta(req, res);
        if (id === null) return;
        try {
            const filas = await pool.query(
                `SELECT h.TipoHabitacion, SUM(d.CantidadHabitaciones) AS CantidadHabitaciones
                 FROM detallesreservacion d JOIN habitaciones h ON h.IDHabitacion = d.IDHabitacion
                 WHERE d.IDReservacion = ? GROUP BY h.TipoHabitacion`, [id]
            );
            res.json(filas);
        } catch (error) { errorBD(res, 'mostrar_detalles_reservacion', error); }
    }
    public async mostrar_detallesReservacion(req: Request, res: Response): Promise<void> {
        const id = idDeRuta(req, res);
        if (id === null) return;
        try {
            const filas = await pool.query(
                'SELECT IDReservacion, IDHabitacion, CantidadHabitaciones FROM detallesreservacion WHERE IDReservacion = ?', [id]
            );
            res.json(filas);
        } catch (error) { errorBD(res, 'mostrar_detallesReservacion', error); }
    }
    private fechaRuta(req: Request, res: Response): string | null {
        const fecha = fechaISO(req.params.fecha);
        if (!fecha) errorSolicitud(res, 'Fecha inválida.');
        return fecha;
    }
    public mostrar_reservaciones_por_fecha = async (req: Request, res: Response): Promise<void> => {
        const fecha = this.fechaRuta(req, res);
        if (!fecha) return;
        try {
            const filas = await pool.query('SELECT * FROM reservaciones WHERE FechaEntrada = ?', [fecha]);
            res.json(filas);
        } catch (error) { errorBD(res, 'mostrar_reservaciones_por_fecha', error); }
    }
    public async mostrar_reservaciones_por_rango_fecha(req: Request, res: Response): Promise<void> {
        const inicio = fechaISO(req.body?.FechaUno);
        const fin = fechaISO(req.body?.FechaDos);
        if (!inicio || !fin || inicio > fin || nochesEntre(inicio, fin) > 365) {
            errorSolicitud(res, 'Rango de fechas inválido.'); return;
        }
        try {
            const filas = await pool.query('SELECT * FROM reservaciones WHERE FechaEntrada >= ? AND FechaEntrada <= ?', [inicio, fin]);
            res.json(filas);
        } catch (error) { errorBD(res, 'mostrar_reservaciones_por_rango_fecha', error); }
    }
    public rellenar_datos_tabla = async (req: Request, res: Response): Promise<void> => {
        const fecha = this.fechaRuta(req, res);
        if (!fecha) return;
        try {
            const filas = await pool.query(
                `SELECT c.NombreCompleto, r.HoraLlegada, c.NumeroTelefono, r.EstadoReserva
                 FROM cuenta c JOIN reservaciones r ON r.IDCuenta = c.IDCuenta
                 WHERE r.FechaEntrada = ?`, [fecha]
            );
            res.json(filas);
        } catch (error) { errorBD(res, 'rellenar_datos_tabla', error); }
    }
    public tabla_reservas = async (req: Request, res: Response): Promise<void> => {
        const fecha = this.fechaRuta(req, res);
        if (!fecha) return;
        try {
            const filas = await pool.query(
                `SELECT r.IDCuenta, r.IDReserva, c.NombreCompleto, r.HoraLlegada,
                        DATE_FORMAT(r.FechaEntrada,'%d-%m-%Y') AS FechaEntrada,
                        DATE_FORMAT(r.FechaSalida,'%d-%m-%Y') AS FechaSalida,
                        c.NumeroTelefono, r.EstadoReserva, r.EstadoPago
                 FROM reservaciones r JOIN cuenta c ON r.IDCuenta = c.IDCuenta
                 WHERE r.FechaEntrada <= ? AND ? < r.FechaSalida`, [fecha, fecha]
            );
            res.json(filas);
        } catch (error) { errorBD(res, 'tabla_reservas', error); }
    }
    public async porcentaje_ocupacion_mensual(req: Request, res: Response): Promise<void> {
        const anio = idSeguro(req.body?.ano);
        if (anio === null || anio < 2000 || anio > 2100) { errorSolicitud(res, 'Año inválido.'); return; }
        try {
            const porcentajes: number[] = [];
            for (let m = 1; m <= 12; m++) {
                const primerDia = `${anio}-${('0' + m).slice(-2)}-01`;
                const prox = m === 12 ? `${anio + 1}-01-01` : `${anio}-${('0' + (m + 1)).slice(-2)}-01`;
                // SEGURIDAD [RES-REPORT-02]: ocupación según inventario diario disponible.
                const filas = await pool.query(
                    `SELECT ROUND(100 * (SUM(h.TotalTipoHabitacion) - SUM(d.TotalHabitacionesDisponibles)) /
                           NULLIF(SUM(h.TotalTipoHabitacion), 0), 2) AS porcentaje
                     FROM disponibilidadporfecha d JOIN habitaciones h ON h.IDHabitacion = d.IDTipoHabitacion
                     WHERE d.Fecha >= ? AND d.Fecha < ?`, [primerDia, prox]
                );
                porcentajes.push(filas[0]?.porcentaje === null ? 0 : Number(filas[0]?.porcentaje ?? 0));
            }
            res.json(porcentajes);
        } catch (error) { errorBD(res, 'porcentaje_ocupacion_mensual', error); }
    }
    public async reporte_ventas_mensual(req: Request, res: Response): Promise<void> {
        const anio = idSeguro(req.body?.ano);
        if (anio === null || anio < 2000 || anio > 2100) { errorSolicitud(res, 'Año inválido.'); return; }
        try {
            const ventas: number[] = [];
            for (let m = 1; m <= 12; m++) {
                const primerDia = `${anio}-${('0' + m).slice(-2)}-01`;
                const prox = m === 12 ? `${anio + 1}-01-01` : `${anio}-${('0' + (m + 1)).slice(-2)}-01`;
                const filas = await pool.query(
                    `SELECT COALESCE(SUM(CostoTotal),0) AS venta
                     FROM reservaciones
                     WHERE EstadoPago = 'Pagado' AND FechaSalida >= ? AND FechaSalida < ?`,
                    [primerDia, prox]
                );
                ventas.push(Number(filas[0]?.venta ?? 0));
            }
            res.json(ventas);
        } catch (error) { errorBD(res, 'reporte_ventas_mensual', error); }
    }
}

export const reservacionesController = new ReservacionesController();

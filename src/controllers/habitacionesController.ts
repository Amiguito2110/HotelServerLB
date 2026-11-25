import { Request, Response } from 'express';
import pool from '../database';

// SEGURIDAD [HAB-MASS-01]: Campos definidos en el servidor.
// Se basan en el modelo Angular de habitaciones; confirmar nombres y límites con el esquema SQL vigente.
type CampoHabitacion =
    | 'TipoHabitacion'
    | 'MaxHuespedes'
    | 'TotalTipoHabitacion'
    | 'Costo'
    | 'descripcion'
    | 'description';

type DatosHabitacion = Partial<Record<CampoHabitacion, string | number>>;

const CAMPOS_EDITABLES: CampoHabitacion[] = [
    'TipoHabitacion',
    'MaxHuespedes',
    'TotalTipoHabitacion',
    'Costo',
    'descripcion',
    'description'
];

function validarId(valor: unknown): number | null {
    if (typeof valor !== 'string' || !/^[1-9]\d*$/.test(valor)) return null;
    const id = Number(valor);
    return Number.isSafeInteger(id) ? id : null;
}

function validarEnteroPositivo(valor: unknown): number | null {
    return typeof valor === 'number' && Number.isSafeInteger(valor) && valor > 0
        ? valor : null;
}

function validarTexto(valor: unknown, maximo: number, obligatorio: boolean): string | null {
    if (typeof valor !== 'string') return null;
    const texto = valor.trim();
    if (texto.length > maximo || (obligatorio && !texto) || /[\u0000-\u001F\u007F]/.test(texto)) {
        return null;
    }
    return texto;
}

// SEGURIDAD [HAB-VAL-02, HAB-MASS-01]: Validar solamente los campos de negocio permitidos.
function validarDatosHabitacion(cuerpo: unknown, creacion: boolean): DatosHabitacion | null {
    if (typeof cuerpo !== 'object' || cuerpo === null || Array.isArray(cuerpo)) return null;
    const entrada = cuerpo as Record<string, unknown>;
    const datos: DatosHabitacion = {};

    for (const campo of CAMPOS_EDITABLES) {
        if (!Object.prototype.hasOwnProperty.call(entrada, campo)) continue;
        const valor = entrada[campo];

        if (campo === 'TipoHabitacion') {
            const texto = validarTexto(valor, 100, true);
            if (texto === null) return null;
            datos.TipoHabitacion = texto;
        } else if (campo === 'MaxHuespedes' || campo === 'TotalTipoHabitacion') {
            const numero = validarEnteroPositivo(valor);
            if (numero === null) return null;
            datos[campo] = numero;
        } else if (campo === 'Costo') {
            if (typeof valor !== 'number' || !Number.isFinite(valor) || valor <= 0 || valor > 100000000) {
                return null;
            }
            datos.Costo = valor;
        } else if (campo === 'descripcion' || campo === 'description') {
            const texto = validarTexto(valor, 4000, false);
            if (texto === null) return null;
            datos[campo] = texto;
        }
    }

    if (creacion) {
        // SEGURIDAD [HAB-MASS-01]: IDHabitacion e idFotoPrincipal no vienen del cliente.
        if (
            datos.TipoHabitacion === undefined ||
            datos.MaxHuespedes === undefined ||
            datos.TotalTipoHabitacion === undefined ||
            datos.Costo === undefined
        ) return null;
        if (datos.descripcion === undefined) datos.descripcion = '';
        if (datos.description === undefined) datos.description = '';
    } else if (Object.keys(datos).length === 0) {
        return null;
    }

    return datos;
}

// SEGURIDAD [HAB-ERR-01]: Mensajes HTTP sin información interna de SQL.
function responderError(res: Response, operacion: string, error: unknown): void {
    const codigo = error && typeof error === 'object' && 'code' in error
        ? String((error as { code?: unknown }).code) : 'ERROR_DESCONOCIDO';
    console.error(`[HabitacionesController] ${operacion}: ${codigo}`);
    if (codigo === 'ER_DUP_ENTRY' || codigo === 'ER_ROW_IS_REFERENCED_2') {
        res.status(409).json({ mensaje: 'La operación entra en conflicto con registros existentes.' });
        return;
    }
    if (codigo === 'ER_NO_REFERENCED_ROW_2') {
        res.status(400).json({ mensaje: 'La relación indicada no es válida.' });
        return;
    }
    res.status(500).json({ mensaje: 'Error interno del servidor.' });
}

// SEGURIDAD [HAB-FECHA-01]: Para habitaciones NUEVAS, generar fechas
// desde CURDATE() hasta 365 días después (ambos extremos incluidos).
// No modifica ni rellena las disponibilidades de habitaciones existentes.

class HabitacionesController {
    public async mostrar_todas_habitaciones(_req: Request, res: Response): Promise<void> {
        try {
            // COMPATIBILIDAD: se mantiene SELECT * hasta verificar todas las columnas públicas.
            const respuesta = await pool.query('SELECT * FROM habitaciones');
            res.json(respuesta);
        } catch (error) {
            responderError(res, 'mostrar_todas_habitaciones', error);
        }
    }

    public async mostrar_habitacion(req: Request, res: Response): Promise<void> {
        const id = validarId(req.params.id);
        if (id === null) { res.status(400).json({ mensaje: 'Identificador inválido.' }); return; }
        try {
            const respuesta = await pool.query('SELECT * FROM habitaciones WHERE IDHabitacion = ?', [id]);
            if (!respuesta.length) { res.status(404).json({ Mensaje: 'Habitacion no encontrada.' }); return; }
            res.json(respuesta[0]);
        } catch (error) {
            responderError(res, 'mostrar_habitacion', error);
        }
    }

    public async total_habitaciones(_req: Request, res: Response): Promise<void> {
        try {
            const respuesta = await pool.query(
                'SELECT SUM(TotalTipoHabitacion) AS TotalHabitaciones FROM habitaciones'
            );
            res.json(respuesta[0]);
        } catch (error) {
            responderError(res, 'total_habitaciones', error);
        }
    }

    public async id_fotos_por_habitacion(req: Request, res: Response): Promise<void> {
        const id = validarId(req.params.id);
        if (id === null) { res.status(400).json({ mensaje: 'Identificador inválido.' }); return; }
        try {
            const respuesta = await pool.query(
                'SELECT * FROM fotos_habitaciones WHERE id_habitacion = ?', [id]
            );
            res.json(respuesta);
        } catch (error) {
            responderError(res, 'id_fotos_por_habitacion', error);
        }
    }

    public async fotoPrincipal_by_Idhabitacion(req: Request, res: Response): Promise<void> {
        const id = validarId(req.params.id);
        if (id === null) { res.status(400).json({ mensaje: 'Identificador inválido.' }); return; }
        try {
            const respuesta = await pool.query(
                'SELECT id_foto FROM fotos_habitaciones WHERE id_habitacion = ? ORDER BY id_foto LIMIT 1',
                [id]
            );
            if (!respuesta.length) {
                res.status(404).json({ mensaje: 'No se encontró ninguna foto para la habitación especificada.' });
                return;
            }
            res.json({ id_foto: respuesta[0].id_foto });
        } catch (error) {
            responderError(res, 'fotoPrincipal_by_Idhabitacion', error);
        }
    }

    public async inserta_datos_foto(req: Request, res: Response): Promise<void> {
        // SEGURIDAD [HAB-VAL-03]: req.body.id es el ID de habitación usado por Angular.
        const id = req.body && validarEnteroPositivo(req.body.id);
        if (typeof id !== 'number') {
            res.status(400).json({ mensaje: 'Identificador de habitación inválido.' });
            return;
        }
        try {
            const existe = await pool.query(
                'SELECT IDHabitacion FROM habitaciones WHERE IDHabitacion = ? LIMIT 1', [id]
            );
            if (!existe.length) { res.status(404).json({ mensaje: 'Habitación no encontrada.' }); return; }
            const respuesta = await pool.query(
                'INSERT INTO fotos_habitaciones (id_habitacion) VALUES (?)', [id]
            );
            res.json(respuesta); // COMPATIBILIDAD: Angular necesita insertId.
        } catch (error) {
            responderError(res, 'inserta_datos_foto', error);
        }
    }

    public async eliminar_datos_foto(req: Request, res: Response): Promise<void> {
        const id = validarId(req.params.id);
        if (id === null) { res.status(400).json({ mensaje: 'Identificador inválido.' }); return; }
        try {
            // SEGURIDAD [HAB-SQL-02]: consulta parametrizada, sin interpolación de ID.
            const resp = await pool.query('DELETE FROM fotos_habitaciones WHERE id_foto = ?', [id]);
            if (resp.affectedRows === 0) { res.status(404).json({ mensaje: 'Foto no encontrada.' }); return; }
            res.json(resp);
        } catch (error) {
            responderError(res, 'eliminar_datos_foto', error);
        }
    }

    public async crear_habitacion(req: Request, res: Response): Promise<void> {
        const datos = validarDatosHabitacion(req.body, true);
        if (!datos) { res.status(400).json({ mensaje: 'Datos de habitación inválidos.' }); return; }

        // SEGURIDAD [HAB-DATA-01]: La habitación y su disponibilidad se confirman juntas.
        let conexion: any = null;
        let transaccionIniciada = false;
        try {
            conexion = await pool.getConnection();
            await conexion.beginTransaction();
            transaccionIniciada = true;

            // SEGURIDAD [HAB-MASS-01]: Solo columnas fijas definidas en el backend.
            const resp = await conexion.query(
                `INSERT INTO habitaciones
                 (TipoHabitacion, MaxHuespedes, TotalTipoHabitacion, Costo, descripcion, description)
                 VALUES (?, ?, ?, ?, ?, ?)`,
                [datos.TipoHabitacion, datos.MaxHuespedes, datos.TotalTipoHabitacion,
                 datos.Costo, datos.descripcion, datos.description]
            );

            // SEGURIDAD [HAB-SQL-03, HAB-FECHA-01]:
            // Parametrizar IDs/cantidades y usar un horizonte de fechas móvil.
            const queryDisponibilidad = `
                INSERT INTO disponibilidadporfecha
                    (IDTipoHabitacion, Fecha, TotalHabitacionesDisponibles)
                SELECT ?, DATE_ADD(CURDATE(), INTERVAL n DAY), ?
                FROM (
                    SELECT a.N + b.N * 10 + c.N * 100 AS n
                    FROM
                        (SELECT 0 AS N UNION ALL SELECT 1 UNION ALL SELECT 2 UNION ALL SELECT 3 UNION ALL SELECT 4 UNION ALL SELECT 5 UNION ALL SELECT 6 UNION ALL SELECT 7 UNION ALL SELECT 8 UNION ALL SELECT 9) AS a
                    CROSS JOIN
                        (SELECT 0 AS N UNION ALL SELECT 1 UNION ALL SELECT 2 UNION ALL SELECT 3 UNION ALL SELECT 4 UNION ALL SELECT 5 UNION ALL SELECT 6 UNION ALL SELECT 7 UNION ALL SELECT 8 UNION ALL SELECT 9) AS b
                    CROSS JOIN
                        (SELECT 0 AS N UNION ALL SELECT 1 UNION ALL SELECT 2 UNION ALL SELECT 3 UNION ALL SELECT 4 UNION ALL SELECT 5 UNION ALL SELECT 6 UNION ALL SELECT 7 UNION ALL SELECT 8 UNION ALL SELECT 9) AS c
                ) AS numbers
                WHERE n BETWEEN 0 AND 365
            `;
            await conexion.query(queryDisponibilidad, [
                resp.insertId,
                datos.TotalTipoHabitacion
            ]);

            await conexion.commit();
            transaccionIniciada = false;
            res.json(resp); // COMPATIBILIDAD: el frontend espera insertId.
        } catch (error) {
            if (conexion && transaccionIniciada) {
                try { await conexion.rollback(); }
                catch (_rollbackError) { console.error('[HabitacionesController] Falló rollback.'); }
            }
            responderError(res, 'crear_habitacion', error);
        } finally {
            if (conexion) pool.releaseConnection(conexion);
        }
    }

    public async actualizar_habitacion(req: Request, res: Response): Promise<void> {
        const id = validarId(req.params.id);
        if (id === null) { res.status(400).json({ mensaje: 'Identificador inválido.' }); return; }
        const datos = validarDatosHabitacion(req.body, false);
        if (!datos) { res.status(400).json({ mensaje: 'No hay campos válidos para actualizar.' }); return; }

        // SEGURIDAD [HAB-MASS-02]: SQL construido solo con nombres de columnas del servidor.
        const columnas = Object.keys(datos) as CampoHabitacion[];
        const cambios = columnas.map(campo => `${campo} = ?`).join(', ');
        const valores = columnas.map(campo => datos[campo]);
        try {
            const resp = await pool.query(
                `UPDATE habitaciones SET ${cambios} WHERE IDHabitacion = ?`,
                [...valores, id]
            );
            if (resp.affectedRows === 0) {
                res.status(404).json({ mensaje: 'Habitación no encontrada.' });
                return;
            }
            res.json(resp);
        } catch (error) {
            responderError(res, 'actualizar_habitacion', error);
        }
    }

    public async eliminar_habitacion(req: Request, res: Response): Promise<void> {
        const id = validarId(req.params.id);
        if (id === null) { res.status(400).json({ mensaje: 'Identificador inválido.' }); return; }
        try {
            // SEGURIDAD [HAB-SQL-01]: eliminar con parámetro enlazado.
            const resp = await pool.query('DELETE FROM habitaciones WHERE IDHabitacion = ?', [id]);
            if (resp.affectedRows === 0) {
                res.status(404).json({ mensaje: 'Habitación no encontrada.' });
                return;
            }
            res.json(resp);
        } catch (error) {
            responderError(res, 'eliminar_habitacion', error);
        }
    }
}

export const habitacionesController = new HabitacionesController();

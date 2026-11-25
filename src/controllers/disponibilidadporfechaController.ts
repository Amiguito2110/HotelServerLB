
import { Request, Response } from 'express';
import pool from '../database';


// ==========================================
// FUNCIONES DE VALIDACIÓN
// ==========================================

// SEGURIDAD [DISP-VAL-01]:
// Validar una fecha real con formato YYYY-MM-DD.
// Evita aceptar fechas como 2026-02-30.
function validarFecha(valor: unknown): string | null {

    if (
        typeof valor !== 'string' ||
        !/^\d{4}-\d{2}-\d{2}$/.test(valor)
    ) {
        return null;
    }

    const anio = Number(valor.substring(0, 4));

    // Rango compatible con el tipo DATE de MySQL.
    if (anio < 1000 || anio > 9999) {
        return null;
    }

    const fecha = new Date(
        `${valor}T00:00:00.000Z`
    );

    if (
        Number.isNaN(fecha.getTime()) ||
        fecha.toISOString().slice(0, 10) !== valor
    ) {
        return null;
    }

    return valor;
}


// SEGURIDAD [DISP-VAL-02]:
// Aceptar únicamente enteros positivos y seguros.
function validarId(valor: unknown): number | null {

    if (
        typeof valor !== 'number' &&
        typeof valor !== 'string'
    ) {
        return null;
    }

    const texto = String(valor);

    if (!/^[1-9]\d*$/.test(texto)) {
        return null;
    }

    const numero = Number(texto);

    return Number.isSafeInteger(numero)
        ? numero
        : null;
}


// SEGURIDAD [DISP-VAL-02]:
// La disponibilidad puede ser cero,
// pero nunca negativa ni fraccionaria.
function validarCantidad(valor: unknown): number | null {

    if (
        typeof valor !== 'number' &&
        typeof valor !== 'string'
    ) {
        return null;
    }

    const texto = String(valor);

    if (!/^(0|[1-9]\d*)$/.test(texto)) {
        return null;
    }

    const numero = Number(texto);

    if (
        !Number.isSafeInteger(numero) ||
        numero > 2147483647
    ) {
        return null;
    }

    return numero;
}


// SEGURIDAD [DISP-ERR-01]:
// Manejar errores SQL sin revelar detalles internos.
function responderError(
    res: Response,
    operacion: string,
    error: unknown
): void {

    let codigo = 'ERROR_DESCONOCIDO';

    if (
        error !== null &&
        typeof error === 'object' &&
        'code' in error
    ) {
        codigo = String(
            (error as { code?: unknown }).code
        );
    }

    console.error(
        `[DisponibilidadController] ${operacion}: ${codigo}`
    );

    // SEGURIDAD [DISP-DATA-02]:
    // Conflicto con una restricción UNIQUE.
    if (codigo === 'ER_DUP_ENTRY') {
        res.status(409).json({
            mensaje: 'Ya existe disponibilidad para esa habitación y fecha.'
        });
        return;
    }

    res.status(500).json({
        mensaje: 'Error interno del servidor.'
    });
}


class DisponibilidadporfechaController {

    // ==========================================
    // CONSULTAR DISPONIBILIDAD POR FECHA
    // ==========================================

    public async mostrar_disponibilidad_fecha(
        req: Request,
        res: Response
    ): Promise<void> {

        // SEGURIDAD [DISP-VAL-01]:
        const fecha = validarFecha(req.params.fecha);

        if (fecha === null) {
            res.status(400).json({
                mensaje: 'Fecha inválida. Utiliza YYYY-MM-DD.'
            });
            return;
        }

        try {

            // SEGURIDAD [DISP-SQL-01]:
            // Consulta parametrizada.
            // Se conservan las columnas del resultado
            // esperado por Angular.
            const respuesta = await pool.query(
                `SELECT
                    d.Fecha,
                    h.TipoHabitacion,
                    d.TotalHabitacionesDisponibles
                 FROM disponibilidadporfecha AS d
                 INNER JOIN habitaciones AS h
                    ON h.IDHabitacion = d.IDTipoHabitacion
                 WHERE DATE(d.Fecha) = ?`,
                [fecha]
            );

            // COMPATIBILIDAD [ANG-01]:
            // Devolver un arreglo como en el controller
            // original, incluso si está vacío.
            res.status(200).json(respuesta);

        } catch (error) {

            // SEGURIDAD [DISP-ERR-01]:
            responderError(
                res,
                'mostrar_disponibilidad_fecha',
                error
            );
        }
    }


    // ==========================================
    // AGREGAR DISPONIBILIDAD
    // ==========================================

    public async agregar_disponibilidad(
        req: Request,
        res: Response
    ): Promise<void> {

        // SEGURIDAD [DISP-MASS-01]:
        // No insertar req.body directamente.
        const datos =
            req.body !== null &&
            typeof req.body === 'object' &&
            !Array.isArray(req.body)
                ? req.body
                : {};

        // Se toman únicamente los campos permitidos.
        const idHabitacion = validarId(
            datos.IDTipoHabitacion
        );

        const fecha = validarFecha(
            datos.Fecha
        );

        const cantidad = validarCantidad(
            datos.TotalHabitacionesDisponibles
        );

        // SEGURIDAD [DISP-VAL-02]:
        // Verificar los tres datos requeridos.
        if (
            idHabitacion === null ||
            fecha === null ||
            cantidad === null
        ) {
            res.status(400).json({
                mensaje: 'Datos de disponibilidad inválidos.'
            });
            return;
        }

        try {

            // SEGURIDAD [DISP-DATA-01]:
            // Comprobar que exista la habitación
            // y consultar su capacidad registrada.
            const habitaciones = await pool.query(
                `SELECT TotalTipoHabitacion
                 FROM habitaciones
                 WHERE IDHabitacion = ?
                 LIMIT 1`,
                [idHabitacion]
            );

            if (
                !Array.isArray(habitaciones) ||
                habitaciones.length === 0
            ) {
                res.status(404).json({
                    mensaje: 'Habitación no encontrada.'
                });
                return;
            }

            const capacidad = Number(
                habitaciones[0].TotalTipoHabitacion
            );

            // SEGURIDAD [DISP-DATA-01]:
            // No permitir disponibilidad mayor
            // que la capacidad total.
            if (
                !Number.isSafeInteger(capacidad) ||
                capacidad < 0
            ) {
                res.status(500).json({
                    mensaje: 'Capacidad de habitación inválida.'
                });
                return;
            }

            if (cantidad > capacidad) {
                res.status(400).json({
                    mensaje:
                        'La disponibilidad supera la capacidad total.'
                });
                return;
            }

            // SEGURIDAD [DISP-DATA-02]:
            // Detectar un registro previo para
            // la misma habitación y fecha.
            const existentes = await pool.query(
                `SELECT 1 AS encontrado
                 FROM disponibilidadporfecha
                 WHERE IDTipoHabitacion = ?
                   AND DATE(Fecha) = ?
                 LIMIT 1`,
                [idHabitacion, fecha]
            );

            if (
                Array.isArray(existentes) &&
                existentes.length > 0
            ) {
                res.status(409).json({
                    mensaje:
                        'Ya existe disponibilidad para esa habitación y fecha.'
                });
                return;
            }

            // SEGURIDAD [DISP-MASS-01, DISP-SQL-02]:
            // Columnas definidas por el servidor.
            // Valores separados mediante parámetros.
            const respuesta = await pool.query(
                `INSERT INTO disponibilidadporfecha
                    (
                        IDTipoHabitacion,
                        Fecha,
                        TotalHabitacionesDisponibles
                    )
                 VALUES (?, ?, ?)`,
                [idHabitacion, fecha, cantidad]
            );

            // COMPATIBILIDAD [ANG-01]:
            // Conservar el formato de respuesta
            // que utilizaba el endpoint original.
            res.json(respuesta);

        } catch (error) {

            // SEGURIDAD [DISP-ERR-01]:
            responderError(
                res,
                'agregar_disponibilidad',
                error
            );
        }
    }
}

export const disponibilidadporfechaController =
    new DisponibilidadporfechaController();

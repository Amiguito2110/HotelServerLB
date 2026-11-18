import { Request, Response } from 'express';
import pool from '../database'; // Acceso a la base de datos

// MITIGACIÓN VAL-01:
// Validar identificadores como enteros positivos seguros.
function validarId(valor: unknown): number | null {
    if (
        (typeof valor !== 'string' && typeof valor !== 'number') ||
        !/^[1-9]\d*$/.test(String(valor))
    ) {
        return null;
    }

    const id = Number(valor);

    return Number.isSafeInteger(id) ? id : null;
}

// MITIGACIÓN VAL-02:
// Validar el porcentaje de descuento.
// Se permiten números y cadenas numéricas del formulario.
function validarPorcentaje(valor: unknown): number | null {
    if (typeof valor !== 'number' && typeof valor !== 'string') {
        return null;
    }

    if (typeof valor === 'string' && valor.trim() === '') {
        return null;
    }

    const porcentaje = Number(valor);

    if (
        !Number.isFinite(porcentaje) ||
        porcentaje < 0 ||
        porcentaje > 100
    ) {
        return null;
    }

    return porcentaje;
}

// MITIGACIÓN VAL-03:
// Validar fechas ISO y convertirlas al formato YYYY-MM-DD.
// Angular envía los objetos Date como cadenas ISO.
function validarFecha(valor: unknown): string | null {
    if (
        typeof valor !== 'string' ||
        !/^\d{4}-\d{2}-\d{2}(?:T.+)?$/.test(valor)
    ) {
        return null;
    }

    const fecha = new Date(valor);

    if (Number.isNaN(fecha.getTime())) {
        return null;
    }

    const fechaNormalizada = fecha.toISOString().slice(0, 10);

    // Evitar aceptar fechas de calendario inexistentes.
    if (
        !valor.includes('T') &&
        valor !== fechaNormalizada
    ) {
        return null;
    }

    return fechaNormalizada;
}

// MITIGACIÓN ERR-01:
// Manejar errores de MySQL sin exponer información interna.
function manejarError(res: Response, error: unknown): void {
    const codigo =
        error !== null &&
        typeof error === 'object' &&
        'code' in error
            ? String((error as { code?: unknown }).code)
            : 'DESCONOCIDO';

    if (codigo === 'ER_DUP_ENTRY') {
        res.status(409).json({
            msg: 'Ya existe un registro que incumple una restricción de unicidad.'
        });
        return;
    }

    if (
        codigo === 'ER_ROW_IS_REFERENCED' ||
        codigo === 'ER_ROW_IS_REFERENCED_2'
    ) {
        res.status(409).json({
            msg: 'No se puede eliminar la promoción porque está relacionada con otros registros.'
        });
        return;
    }

    console.error('Error en promociones. Código:', codigo);

    res.status(500).json({
        msg: 'Error interno del servidor.'
    });
}

class PromocionesController {

    // Mostrar todas las promociones
    public async mostrarTodasPromociones(
        req: Request,
        res: Response
    ): Promise<void> {
        try {
            // MITIGACIÓN DATA-03:
            // Solicitar solamente las columnas requeridas.
            const promociones = await pool.query(
                `SELECT
                    IDPromocion,
                    IDHabitacion,
                    TipoHabitacion,
                    Costo,
                    descuento,
                    costoDesc,
                    fechin,
                    fechout
                 FROM promociones`
            );

            // MITIGACIÓN CODE-01:
            // Se elimina el console.log de depuración.
            res.json(promociones);

        } catch (error) {
            // MITIGACIÓN ERR-01:
            // Gestionar el error sin exponer información SQL.
            manejarError(res, error);
        }
    }

    // Agregar nuevas promociones
    public async agregarPromociones(
        req: Request,
        res: Response
    ): Promise<void> {
        // MITIGACIÓN VAL-04:
        // Comprobar que el cuerpo sea un objeto válido.
        if (
            req.body === null ||
            typeof req.body !== 'object' ||
            Array.isArray(req.body)
        ) {
            res.status(400).json({
                msg: 'El cuerpo de la solicitud no es válido.'
            });
            return;
        }

        const {
            habitacionesSeleccionadas,
            fechin,
            fechout,
            porcentaje
        } = req.body;

        // MITIGACIÓN VAL-04:
        // Exigir un arreglo no vacío y limitar la cantidad.
        if (
            !Array.isArray(habitacionesSeleccionadas) ||
            habitacionesSeleccionadas.length === 0 ||
            habitacionesSeleccionadas.length > 50
        ) {
            res.status(400).json({
                msg: 'Debe seleccionar entre 1 y 50 habitaciones.'
            });
            return;
        }

        // MITIGACIÓN VAL-02:
        // Validar el porcentaje antes de calcular descuentos.
        const descuento = validarPorcentaje(porcentaje);

        if (descuento === null) {
            res.status(400).json({
                msg: 'El porcentaje debe estar entre 0 y 100.'
            });
            return;
        }

        // MITIGACIÓN VAL-03:
        // Validar las fechas y su orden.
        const fechaIn = validarFecha(fechin);
        const fechaOut = validarFecha(fechout);

        if (
            fechaIn === null ||
            fechaOut === null ||
            fechaOut < fechaIn
        ) {
            res.status(400).json({
                msg: 'El rango de fechas no es válido.'
            });
            return;
        }

        // MITIGACIÓN VAL-01 y VAL-04:
        // Validar todos los identificadores antes de operar.
        const idsHabitaciones: number[] = [];
        const idsUnicos = new Set<number>();

        for (const habitacion of habitacionesSeleccionadas) {
            if (
                habitacion === null ||
                typeof habitacion !== 'object' ||
                Array.isArray(habitacion)
            ) {
                res.status(400).json({
                    msg: 'Se recibió una habitación inválida.'
                });
                return;
            }

            const id = validarId(habitacion.IDHabitacion);

            if (id === null || idsUnicos.has(id)) {
                res.status(400).json({
                    msg: 'Existen identificadores inválidos o duplicados.'
                });
                return;
            }

            idsUnicos.add(id);
            idsHabitaciones.push(id);
        }

        try {
            // MITIGACIÓN DATA-02:
            // Obtener una conexión para ejecutar una transacción.
            const conexion = await pool.getConnection();

            try {
                await conexion.beginTransaction();

                for (const id of idsHabitaciones) {

                    // MITIGACIÓN DATA-01:
                    // Consultar los precios reales desde MySQL.
                    // Nunca utilizar el Costo enviado por Angular.
                    const habitaciones = await conexion.query(
                        `SELECT IDHabitacion, TipoHabitacion, Costo
                         FROM habitaciones
                         WHERE IDHabitacion = ?`,
                        [id]
                    );

                    if (habitaciones.length === 0) {
                        throw new Error('HABITACION_NO_EXISTE');
                    }

                    const habitacion = habitaciones[0];

                    const costo = Number(habitacion.Costo);

                    // MITIGACIÓN DATA-01:
                    // Comprobar el costo obtenido de la base de datos.
                    if (!Number.isFinite(costo) || costo < 0) {
                        throw new Error('COSTO_INVALIDO');
                    }

                    // MITIGACIÓN VAL-02 y DATA-01:
                    // Calcular el costo con datos del servidor.
                    // Redondear a dos decimales para importes
                    // monetarios, sujeto al esquema de MySQL.
                    const costoDesc = Number(
                        (costo * (1 - descuento / 100)).toFixed(2)
                    );

                    // Se conserva la consulta parametrizada original.
                    // Los valores se obtienen de datos validados
                    // y de la tabla habitaciones.
                    await conexion.query(
                        `INSERT INTO promociones
                         (
                            IDHabitacion,
                            TipoHabitacion,
                            Costo,
                            descuento,
                            costoDesc,
                            fechin,
                            fechout
                         )
                         VALUES (?, ?, ?, ?, ?, ?, ?)`,
                        [
                            id,
                            habitacion.TipoHabitacion,
                            costo,
                            descuento,
                            costoDesc,
                            fechaIn,
                            fechaOut
                        ]
                    );
                }

                // MITIGACIÓN DATA-02:
                // Confirmar las inserciones solo si todas
                // se realizaron correctamente.
                await conexion.commit();

                res.json({
                    msg: 'Promociones agregadas correctamente'
                });

            } catch (error) {
                // MITIGACIÓN DATA-02:
                // Revertir las inserciones si ocurre un fallo.
                await conexion.rollback();

                if (
                    error instanceof Error &&
                    error.message === 'HABITACION_NO_EXISTE'
                ) {
                    res.status(400).json({
                        msg: 'Una de las habitaciones no existe.'
                    });
                    return;
                }

                if (
                    error instanceof Error &&
                    error.message === 'COSTO_INVALIDO'
                ) {
                    res.status(422).json({
                        msg: 'Una habitación tiene un costo inválido.'
                    });
                    return;
                }

                throw error;

            } finally {
                // MITIGACIÓN DATA-02:
                // Liberar la conexión utilizada.
                conexion.release();
            }

        } catch (error) {
            // MITIGACIÓN ERR-01:
            // Respuesta controlada ante errores.
            manejarError(res, error);
        }
    }

    public async eliminarPromocion(
        req: Request,
        res: Response
    ): Promise<void> {

        // MITIGACIÓN VAL-01:
        // Validar el identificador recibido en la URL.
        const id = validarId(req.params.id);

        if (id === null) {
            res.status(400).json({
                msg: 'Identificador de promoción inválido.'
            });
            return;
        }

        try {
            // MITIGACIÓN SQL-01:
            // ANTES: DELETE con interpolación directa.
            // DESPUÉS: consulta con marcador ?.
            const resp = await pool.query(
                'DELETE FROM promociones WHERE IDPromocion = ?',
                [id]
            );

            // MITIGACIÓN ERR-01:
            // Verificar si se eliminó algún registro.
            if (resp.affectedRows === 0) {
                res.status(404).json({
                    msg: 'Promoción no encontrada.'
                });
                return;
            }

            res.json(resp);

        } catch (error) {
            // MITIGACIÓN ERR-01:
            // Capturar fallos y devolver un mensaje controlado.
            manejarError(res, error);
        }
    }
}

export const promocionesController = new PromocionesController();

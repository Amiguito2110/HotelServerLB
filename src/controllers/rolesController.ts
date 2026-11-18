import { Request, Response } from 'express';
import pool from '../database'; // Acceso a la base de datos

// MITIGACIÓN VAL-01:
// Validar que el ID sea un entero positivo y seguro.
// Evita enviar identificadores inválidos a MySQL.
function validarId(id: string): number | null {
    if (!/^[1-9]\d*$/.test(id)) {
        return null;
    }

    const idNumero = Number(id);

    if (!Number.isSafeInteger(idNumero)) {
        return null;
    }

    return idNumero;
}

// MITIGACIÓN VAL-01 y VAL-02:
// Validar el nombre y permitir únicamente el campo NombreRol.
// Impide modificar columnas no autorizadas mediante req.body.
function validarNombreRol(body: unknown): string | null {
    if (body === null || typeof body !== 'object' ||
        Array.isArray(body)) {
        return null;
    }

    const datos = body as Record<string, unknown>;
    const campos = Object.keys(datos);

    // MITIGACIÓN VAL-02: lista de campos permitidos.
    if (campos.length !== 1 || campos[0] !== 'NombreRol') {
        return null;
    }

    // MITIGACIÓN VAL-01: comprobar tipo de dato.
    if (typeof datos.NombreRol !== 'string') {
        return null;
    }

    const nombre = datos.NombreRol.trim();

    // MITIGACIÓN VAL-01:
    // Comprobar longitud y caracteres permitidos.
    // El máximo de 50 debe verificarse con la columna MySQL.
    if (
        nombre.length < 2 ||
        nombre.length > 50 ||
        !/^[A-Za-zÁÉÍÓÚÜÑáéíóúüñ0-9 _-]+$/.test(nombre)
    ) {
        return null;
    }

    return nombre;
}

// MITIGACIÓN ERR-01:
// Centralizar el manejo de errores para no exponer
// mensajes internos ni consultas SQL al cliente.
function manejarError(res: Response, error: unknown): void {
    const codigo =
        error !== null &&
        typeof error === 'object' &&
        'code' in error
            ? String((error as { code?: unknown }).code)
            : 'DESCONOCIDO';

    // MITIGACIÓN ERR-01: manejar conflictos de unicidad.
    if (codigo === 'ER_DUP_ENTRY') {
        res.status(409).json({
            Mensaje: 'El rol ya existe o incumple una restricción de unicidad.'
        });
        return;
    }

    // MITIGACIÓN ERR-01:
    // Evitar revelar detalles de relaciones entre tablas.
    if (
        codigo === 'ER_ROW_IS_REFERENCED' ||
        codigo === 'ER_ROW_IS_REFERENCED_2'
    ) {
        res.status(409).json({
            Mensaje: 'No se puede completar la operación porque el rol está en uso.'
        });
        return;
    }

    // MITIGACIÓN ERR-01:
    // Registrar únicamente información limitada del error.
    console.error('Error al operar con roles. Código:', codigo);

    res.status(500).json({
        Mensaje: 'Error interno del servidor.'
    });
}

class RolesController {

    public async mostrar_todos_roles(
        req: Request,
        res: Response
    ): Promise<void> {

        // MITIGACIÓN ERR-01:
        // Controlar errores durante la consulta.
        try {
            // MITIGACIÓN DATA-01:
            // Seleccionar únicamente las columnas necesarias.
            const respuesta = await pool.query(
                'SELECT IDRol, NombreRol FROM roles'
            );

            res.json(respuesta);

        } catch (error) {
            manejarError(res, error);
        }
    }

    public async listOne(
        req: Request,
        res: Response
    ): Promise<void> {

        // MITIGACIÓN VAL-01:
        // Validar el identificador recibido desde la URL.
        const id = validarId(req.params.id);

        if (id === null) {
            res.status(400).json({
                Mensaje: 'Identificador de rol inválido.'
            });
            return;
        }

        // MITIGACIÓN ERR-01:
        // Capturar posibles errores de MySQL.
        try {
            // MITIGACIÓN DATA-01:
            // Seleccionar columnas específicas.
            // Se conserva la consulta parametrizada original.
            const respuesta = await pool.query(
                'SELECT IDRol, NombreRol FROM roles WHERE IDRol = ?',
                [id]
            );

            if (respuesta.length > 0) {
                res.json(respuesta[0]);
                return;
            }

            res.status(404).json({
                Mensaje: 'Rol no encontrado.'
            });

        } catch (error) {
            manejarError(res, error);
        }
    }

    public async createRol(
        req: Request,
        res: Response
    ): Promise<void> {

        // MITIGACIÓN VAL-01 y VAL-02:
        // Validar el cuerpo y aceptar solo NombreRol.
        const nombre = validarNombreRol(req.body);

        if (nombre === null) {
            res.status(400).json({
                Mensaje: 'Se requiere únicamente un NombreRol válido de 2 a 50 caracteres.'
            });
            return;
        }

        // MITIGACIÓN ERR-01:
        // Gestionar los errores durante la inserción.
        try {
            // MITIGACIÓN VAL-02:
            // Ya no se envía req.body completo a MySQL.
            // Se especifica la columna permitida.
            const resp = await pool.query(
                'INSERT INTO roles (NombreRol) VALUES (?)',
                [nombre]
            );

            res.json(resp);

        } catch (error) {
            manejarError(res, error);
        }
    }

    public async actualizarRol(
        req: Request,
        res: Response
    ): Promise<void> {

        // MITIGACIÓN VAL-01:
        // Validar el identificador del rol.
        const id = validarId(req.params.id);

        if (id === null) {
            res.status(400).json({
                Mensaje: 'Identificador de rol inválido.'
            });
            return;
        }

        // MITIGACIÓN VAL-01 y VAL-02:
        // Validar el cuerpo y restringir campos.
        const nombre = validarNombreRol(req.body);

        if (nombre === null) {
            res.status(400).json({
                Mensaje: 'Se requiere únicamente un NombreRol válido de 2 a 50 caracteres.'
            });
            return;
        }

        // MITIGACIÓN ERR-01:
        // Manejar errores de actualización.
        try {
            // MITIGACIÓN VAL-02:
            // Sustituir SET ? con req.body completo
            // por una actualización explícita de NombreRol.
            const resp = await pool.query(
                'UPDATE roles SET NombreRol = ? WHERE IDRol = ?',
                [nombre, id]
            );

            // MITIGACIÓN ERR-01:
            // Detectar cuando no existe el registro.
            if (resp.affectedRows === 0) {
                res.status(404).json({
                    Mensaje: 'Rol no encontrado.'
                });
                return;
            }

            // Se eliminó el console.log(id) original.
            // Evita registros innecesarios de parámetros.
            res.json(resp);

        } catch (error) {
            manejarError(res, error);
        }
    }

    public async eliminarRol(
        req: Request,
        res: Response
    ): Promise<void> {

        // MITIGACIÓN VAL-01:
        // Verificar que el ID tenga un formato válido.
        const id = validarId(req.params.id);

        if (id === null) {
            res.status(400).json({
                Mensaje: 'Identificador de rol inválido.'
            });
            return;
        }

        // MITIGACIÓN ERR-01:
        // Controlar errores durante la eliminación.
        try {
            // MITIGACIÓN SQL-01:
            // ANTES: interpolación directa del ID.
            // AHORA: marcador ? y valor separado de la consulta.
            const resp = await pool.query(
                'DELETE FROM roles WHERE IDRol = ?',
                [id]
            );

            // MITIGACIÓN ERR-01:
            // Comprobar si realmente existía el registro.
            if (resp.affectedRows === 0) {
                res.status(404).json({
                    Mensaje: 'Rol no encontrado.'
                });
                return;
            }

            res.json(resp);

        } catch (error) {
            manejarError(res, error);
        }
    }
}

export const rolesController = new RolesController();

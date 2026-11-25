
import {
    Request,
    Response,
    NextFunction
} from 'express';

import pool from '../database';

import { RolUsuario } from './autorizarRoles';

// SEGURIDAD [AUTH-CUENTA-01]:
// Permitir acceso a la cuenta propia o
// a un Administrador autenticado.
export const autorizarCuentaPropiaOAdmin = async (
    req: Request,
    res: Response,
    next: NextFunction
): Promise<void> => {

    // SEGURIDAD [AUTH-CUENTA-02]:
    // Identidad obtenida del JWT previamente verificado.
    const idAutenticado =
        res.locals.usuarioAutenticado?.idCuenta;

    const idSolicitado = Number(req.params.id);

    if (
        typeof idAutenticado !== 'number' ||
        !Number.isSafeInteger(idAutenticado) ||
        idAutenticado <= 0
    ) {
        res.status(401).json({
            mensaje: 'Autenticación requerida.'
        });
        return;
    }

    // SEGURIDAD [VAL-01]:
    if (
        !Number.isSafeInteger(idSolicitado) ||
        idSolicitado <= 0
    ) {
        res.status(400).json({
            mensaje: 'Identificador inválido.'
        });
        return;
    }

    try {

        // SEGURIDAD [AUTH-CUENTA-03]:
        // Consultar el rol real desde MySQL.
        const cuentas = await pool.query(
            `SELECT Rol
             FROM cuenta
             WHERE IDCuenta = ?
             LIMIT 1`,
            [idAutenticado]
        );

        if (
            !Array.isArray(cuentas) ||
            cuentas.length === 0
        ) {
            res.status(401).json({
                mensaje: 'Cuenta no válida.'
            });
            return;
        }

        const rolActual = Number(cuentas[0].Rol);

        const rolValido =
            rolActual === RolUsuario.ADMINISTRADOR ||
            rolActual === RolUsuario.RECEPCIONISTA ||
            rolActual === RolUsuario.CLIENTE;

        if (!rolValido) {
            res.status(403).json({
                mensaje: 'Acceso denegado.'
            });
            return;
        }

        // SEGURIDAD [AUTH-CUENTA-04]:
        // Comprobar propiedad o privilegio administrativo.
        const esPropietario =
            idAutenticado === idSolicitado;

        const esAdministrador =
            rolActual === RolUsuario.ADMINISTRADOR;

        if (!esPropietario && !esAdministrador) {
            res.status(403).json({
                mensaje: 'No tienes permiso sobre esta cuenta.'
            });
            return;
        }

        res.locals.usuarioAutenticado.rol = rolActual;

        next();

    } catch (_error) {

        // SEGURIDAD [ERR-02]:
        // Si MySQL falla, no permitir el acceso.
        console.error(
            '[Autorización] Error al verificar la cuenta.'
        );

        res.status(500).json({
            mensaje: 'No fue posible verificar los permisos.'
        });
    }
};

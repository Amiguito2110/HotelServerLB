
import { Request, Response, NextFunction } from 'express';

import pool from '../database';

// SEGURIDAD [AUTH-03]:
// Roles definidos actualmente en Hotel Campestre.
export enum RolUsuario {
    ADMINISTRADOR = 1,
    RECEPCIONISTA = 2,
    CLIENTE = 3
}

// SEGURIDAD [AUTH-03, AUTH-05]:
// Middleware reutilizable que recibe los roles
// autorizados para utilizar un endpoint.
export const autorizarRoles = (
    ...rolesPermitidos: RolUsuario[]
) => {

    // SEGURIDAD [AUTH-05]:
    // Evitar configurar accidentalmente una ruta
    // sin una política explícita de autorización.
    if (rolesPermitidos.length === 0) {
        throw new Error(
            'Debe especificarse al menos un rol permitido.'
        );
    }

    return async (
        req: Request,
        res: Response,
        next: NextFunction
    ): Promise<void> => {

        // SEGURIDAD [AUTH-04]:
        // Recuperar la identidad previamente verificada
        // por validarToken().
        const idCuenta =
            res.locals.usuarioAutenticado?.idCuenta;

        if (
            typeof idCuenta !== 'number' ||
            !Number.isSafeInteger(idCuenta) ||
            idCuenta <= 0
        ) {
            res.status(401).json({
                mensaje: 'Autenticación requerida.'
            });
            return;
        }

        try {

            // SEGURIDAD [AUTH-04, AUTH-06]:
            // Consultar el rol real desde MySQL.
            // No confiar en localStorage, req.body
            // ni en un rol enviado por el cliente.
            const cuentas = await pool.query(
                `SELECT Rol
                 FROM cuenta
                 WHERE IDCuenta = ?
                 LIMIT 1`,
                [idCuenta]
            );

            // SEGURIDAD [AUTH-05]:
            // Si la cuenta ya no existe, rechazar.
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

            // SEGURIDAD [AUTH-05]:
            // Validar que MySQL devuelva un rol
            // reconocido por nuestro sistema.
            if (
                !Number.isSafeInteger(rolActual) ||
                ![
                    RolUsuario.ADMINISTRADOR,
                    RolUsuario.RECEPCIONISTA,
                    RolUsuario.CLIENTE
                ].includes(rolActual)
            ) {
                res.status(403).json({
                    mensaje: 'Acceso denegado.'
                });
                return;
            }

            // SEGURIDAD [AUTH-03, AUTH-05]:
            // Comprobar la política de autorización.
            if (!rolesPermitidos.includes(rolActual)) {
                res.status(403).json({
                    mensaje: 'No tienes permisos para esta operación.'
                });
                return;
            }

            // SEGURIDAD [AUTH-04]:
            // Guardar el rol verificado para
            // los siguientes controles y controllers.
            res.locals.usuarioAutenticado.rol = rolActual;

            // SEGURIDAD [AUTH-03]:
            // Continuar solamente si está autorizado.
            next();

        } catch (error) {

            // SEGURIDAD [ERR-02]:
            // Fallar de forma segura si MySQL no responde.
            // No revelar SQL ni información interna.
            console.error(
                '[Autorización] Error al consultar permisos.'
            );

            res.status(500).json({
                mensaje: 'No fue posible verificar los permisos.'
            });
        }
    };
};

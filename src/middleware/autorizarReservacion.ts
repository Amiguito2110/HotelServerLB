import { Request, Response, NextFunction } from 'express';
import pool from '../database';
import { RolUsuario } from './autorizarRoles';

// SEGURIDAD [RES-AUTH-02]: validar IDs de URL sin conversiones permisivas.
export const validarIdReservacion = (req: Request, res: Response, next: NextFunction): void => {
    const valor = req.params.id;
    if (!/^[1-9]\d*$/.test(valor) || !Number.isSafeInteger(Number(valor))) {
        res.status(400).json({ mensaje: 'Identificador inválido.' });
        return;
    }
    next();
};

// Se ejecuta DESPUÉS de validarToken y autorizarRoles(1, 2, 3).
const esPersonal = (rol: number): boolean =>
    rol === RolUsuario.ADMINISTRADOR || rol === RolUsuario.RECEPCIONISTA;

// SEGURIDAD [RES-AUTH-03]: acceso a listado de reservaciones de una cuenta.
export const autorizarReservacionesDeCuenta = (
    req: Request, res: Response, next: NextFunction
): void => {
    const identidad = res.locals.usuarioAutenticado;
    const id = Number(req.params.id);
    if (!identidad || !Number.isSafeInteger(identidad.idCuenta)) {
        res.status(401).json({ mensaje: 'Autenticación requerida.' });
        return;
    }
    if (esPersonal(identidad.rol) || identidad.idCuenta === id) {
        next();
        return;
    }
    res.status(403).json({ mensaje: 'Acceso denegado.' });
};

// SEGURIDAD [RES-AUTH-04]: comprobar la propiedad de una reservación concreta.
export const autorizarReservacionPropiaOPersonal = async (
    req: Request, res: Response, next: NextFunction
): Promise<void> => {
    const identidad = res.locals.usuarioAutenticado;
    if (!identidad || !Number.isSafeInteger(identidad.idCuenta)) {
        res.status(401).json({ mensaje: 'Autenticación requerida.' });
        return;
    }
    try {
        const filas = await pool.query(
            'SELECT IDCuenta FROM reservaciones WHERE IDReserva = ? LIMIT 1',
            [Number(req.params.id)]
        );
        if (!Array.isArray(filas) || filas.length === 0) {
            res.status(404).json({ mensaje: 'Reservación no encontrada.' });
            return;
        }
        if (!esPersonal(identidad.rol) && Number(filas[0].IDCuenta) !== identidad.idCuenta) {
            res.status(403).json({ mensaje: 'Acceso denegado.' });
            return;
        }
        next();
    } catch (_error) {
        console.error('[Reserva] No se pudo comprobar la propiedad.');
        res.status(500).json({ mensaje: 'No fue posible verificar permisos.' });
    }
};

import { Router, Request, Response, NextFunction } from 'express';
import { reservacionesController } from '../controllers/reservacionesController';
import { validarToken } from '../middleware/auth';
import { autorizarRoles, RolUsuario } from '../middleware/autorizarRoles';
import {
    validarIdReservacion,
    autorizarReservacionesDeCuenta,
    autorizarReservacionPropiaOPersonal
} from '../middleware/autorizarReservacion';

class ReservacionesRoutes {
    public router: Router = Router();
    constructor() { this.config(); }

    config(): void {
        // SEGURIDAD [RES-PUB-01]: catálogo y cotización, sin datos personales.
        // Se conservan las URLs que utiliza Angular.
        this.router.post('/mostrar_habitaciones_disponibles_una_fecha', reservacionesController.mostrar_habitaciones_disponibles_una_fecha);
        this.router.post('/mostrar_habitaciones_disponibles_rango_fecha', reservacionesController.mostrar_habitaciones_disponibles_rango_fecha);
        this.router.post('/mostrar_habitaciones_num_disponibilidad', reservacionesController.mostrar_habitaciones_num_disponibilidad);
        this.router.post('/setearCostoTotal/', reservacionesController.setearCostoTotal);

        // SEGURIDAD [RES-DATA-02]: no almacenar respuestas sensibles en caché HTTP.
        this.router.use((_req: Request, res: Response, next: NextFunction): void => {
            res.setHeader('Cache-Control', 'no-store');
            next();
        });

        // SEGURIDAD [RES-AUTH-01]: las rutas posteriores exigen JWT y rol vigente en MySQL.
        this.router.use(validarToken);
        this.router.use(autorizarRoles(
            RolUsuario.ADMINISTRADOR,
            RolUsuario.RECEPCIONISTA,
            RolUsuario.CLIENTE
        ));

        // Reservar con cuenta propia; personal puede registrar reserva de otro cliente.
        this.router.post('/hacer_reservacion_2/', reservacionesController.hacer_reservacion_2);

        // SEGURIDAD [RES-LEGACY-01]: operación antigua insegura, inhabilitada (HTTP 410).
        this.router.post('/hacer_reservacion/', reservacionesController.hacer_reservacion);

        // SEGURIDAD [RES-OWNER-01]: acceso a reservas de la propia cuenta o del personal.
        this.router.get('/reservas_idUsuario/:id', validarIdReservacion, autorizarReservacionesDeCuenta, reservacionesController.reservas_idUsuario);
        this.router.get('/mostrar_reservaciones_por_IDCuenta/:id', validarIdReservacion, autorizarReservacionesDeCuenta, reservacionesController.mostrar_reservaciones_por_IDCuenta);

        // SEGURIDAD [RES-OWNER-02]: acceso a los detalles SOLO de reservas propias o del personal.
        this.router.get('/mostrar_detalles_reservacion/:id', validarIdReservacion, autorizarReservacionPropiaOPersonal, reservacionesController.mostrar_detalles_reservacion);
        this.router.get('/mostrar_detallesReservacion/:id', validarIdReservacion, autorizarReservacionPropiaOPersonal, reservacionesController.mostrar_detallesReservacion);

        // SEGURIDAD [RES-CANCEL-01]: cancelación integrada y transaccional.
        this.router.delete('/cancelar_reservacion/:id', validarIdReservacion, autorizarReservacionPropiaOPersonal, reservacionesController.cancelar_reservacion);
        this.router.put('/modificar_estado_reserva/:id', validarIdReservacion, autorizarReservacionPropiaOPersonal, reservacionesController.modificar_estado_reserva);

        // Ruta antigua de Angular: no modifica disponibilidad, solo compatibilidad.
        // Retirar cuando Angular use una sola solicitud de cancelación.
        this.router.post('/actualizar_despues_de_cancelacion/', reservacionesController.actualizar_despues_de_cancelacion);

        // Personal autorizado: recepcionista y administrador.
        const personal = autorizarRoles(RolUsuario.ADMINISTRADOR, RolUsuario.RECEPCIONISTA);
        this.router.put('/modificar_estado_pago/:id', personal, validarIdReservacion, reservacionesController.modificar_estado_pago);
        this.router.put('/modificar_reservacion/:id', personal, validarIdReservacion, reservacionesController.modificar_reservacion);
        this.router.get('/mostrar_reservaciones_por_fecha/:fecha', personal, reservacionesController.mostrar_reservaciones_por_fecha);
        this.router.post('/mostrar_reservaciones_por_rango_fecha/', personal, reservacionesController.mostrar_reservaciones_por_rango_fecha);
        this.router.get('/rellenar_datos_tabla/:fecha', personal, reservacionesController.rellenar_datos_tabla);
        this.router.get('/tabla_reservas/:fecha', personal, reservacionesController.tabla_reservas);

        // SEGURIDAD [RES-REPORT-01]: reportes exclusivamente administrativos.
        this.router.post('/porcentaje_ocupacion_mensual/', autorizarRoles(RolUsuario.ADMINISTRADOR), reservacionesController.porcentaje_ocupacion_mensual);
        this.router.post('/reporte_ventas_mensual/', autorizarRoles(RolUsuario.ADMINISTRADOR), reservacionesController.reporte_ventas_mensual);
    }
}

const reservacionesRoutes = new ReservacionesRoutes();
export default reservacionesRoutes.router;

import { Router, Request, Response, NextFunction } from 'express';
import { habitacionesController } from '../controllers/habitacionesController';
import { validarToken } from '../middleware/auth';
import { autorizarRoles, RolUsuario } from '../middleware/autorizarRoles';

// SEGURIDAD [HAB-VAL-01]: Evitar IDs inválidos y conversiones permisivas.
const validarId = (req: Request, res: Response, next: NextFunction): void => {
    const { id } = req.params;
    if (!/^[1-9]\d*$/.test(id) || !Number.isSafeInteger(Number(id))) {
        res.status(400).json({ mensaje: 'Identificador inválido.' });
        return;
    }
    next();
};

// SEGURIDAD [HAB-HTTP-01]: No almacenar respuestas de operaciones privadas.
const evitarCache = (_req: Request, res: Response, next: NextFunction): void => {
    res.setHeader('Cache-Control', 'no-store');
    next();
};

class HabitacionesRoutes {
    public router: Router = Router();

    constructor() {
        this.config();
    }

    config(): void {
        // SEGURIDAD [HAB-AUTH-01]: Lectura pública para catálogo y reservas.
        this.router.get('/mostrar_todas_habitaciones/', habitacionesController.mostrar_todas_habitaciones);
        this.router.get('/mostrar_habitacion/:id', validarId, habitacionesController.mostrar_habitacion);
        this.router.get('/total_habitaciones/', habitacionesController.total_habitaciones);
        this.router.get('/id_fotos_por_habitacion/:id', validarId, habitacionesController.id_fotos_por_habitacion);
        this.router.get('/fotoPrincipal_por_Idhabitacion/:id', validarId, habitacionesController.fotoPrincipal_by_Idhabitacion);

        // SEGURIDAD [HAB-AUTH-02]: Todas las escrituras requieren JWT y rol Administrador.
        // No usar los valores de Rol almacenados en Angular como fuente de autorización.
        this.router.use(evitarCache, validarToken, autorizarRoles(RolUsuario.ADMINISTRADOR));

        this.router.post('/crear_habitacion/', habitacionesController.crear_habitacion);
        this.router.put('/actualizar_habitacion/:id', validarId, habitacionesController.actualizar_habitacion);
        this.router.delete('/eliminar_habitacion/:id', validarId, habitacionesController.eliminar_habitacion);
        this.router.post('/insertar_datos_foto/', habitacionesController.inserta_datos_foto);
        this.router.delete('/eliminar_datos_foto/:id', validarId, habitacionesController.eliminar_datos_foto);
    }
}

const habitacionesRoutes = new HabitacionesRoutes();
export default habitacionesRoutes.router;

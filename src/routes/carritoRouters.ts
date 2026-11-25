import { Router, Request, Response, NextFunction } from 'express';
import { carritoController } from '../controllers/carritoController';
import { validarToken } from '../middleware/auth';
import { autorizarRoles, RolUsuario } from '../middleware/autorizarRoles';

class CarritoRoutes {
    public router: Router = Router();
    constructor() { this.config(); }

    config(): void {
        // SEGURIDAD [CAR-AUTH-01]: todas las operaciones son privadas.
        this.router.use((_req: Request, res: Response, next: NextFunction): void => {
            res.setHeader('Cache-Control', 'no-store');
            next();
        });
        this.router.use(validarToken);
        this.router.use(autorizarRoles(RolUsuario.CLIENTE));

        // Mantener las rutas utilizadas por Angular.
        this.router.put('/actualizar_carrito/:id', carritoController.actualizar_carrito);
        this.router.post('/agregar_carrito/', carritoController.agregar_carrito);
        this.router.delete('/eliminar_carrito/:id', carritoController.eliminar_carrito);
        this.router.get('/mostrar_carrito/:id', carritoController.mostrar_carrito);
        this.router.get('/mostrar_detalle_carrito/:id', carritoController.mostrar_detalle_carrito);
        // Compatibilidad: GET con efecto de actualización. Migrar a POST en la siguiente versión.
        this.router.get('/filtrar_carrito/:id', carritoController.filtrar_carrito);
        this.router.get('/mostrar_carrito_no_disponibles/:id', carritoController.mostrar_carrito_no_disponibles);
    }
}

const carritoRoutes = new CarritoRoutes();
export default carritoRoutes.router;

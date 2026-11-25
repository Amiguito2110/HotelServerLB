import { Router } from 'express';
import { promocionesController } from '../controllers/promocionesController';
import { validarToken } from '../middleware/auth';
import {
    autorizarRoles,
    RolUsuario
} from '../middleware/autorizarRoles';

class PromocionesRoutes {

    public router: Router = Router();

    constructor() {
        this.config();
    }

    config(): void {

        // SEGURIDAD [PROM-PUB-01]:
        // La consulta de promociones sigue siendo pública.
        this.router.get(
            '/mostrarTodasPromociones/',
            promocionesController.mostrarTodasPromociones
        );

        // SEGURIDAD [PROM-AUTH-01]:
        // Solo el Administrador puede crear promociones.
        this.router.post(
            '/agregarPromociones/',
            validarToken,
            autorizarRoles(RolUsuario.ADMINISTRADOR),
            promocionesController.agregarPromociones
        );

        // SEGURIDAD [PROM-AUTH-02]:
        // Solo el Administrador puede eliminar promociones.
        this.router.delete(
            '/eliminarPromocion/:id',
            validarToken,
            autorizarRoles(RolUsuario.ADMINISTRADOR),
            promocionesController.eliminarPromocion
        );
    }
}

const promocionesRoutes = new PromocionesRoutes();

export default promocionesRoutes.router;

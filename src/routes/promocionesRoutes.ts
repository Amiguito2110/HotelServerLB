import { Router } from 'express';
import { promocionesController } from '../controllers/promocionesController';

class PromocionesRoutes {

    public router: Router = Router();

    constructor() {
        this.config();
    }

    // MITIGACIÓN CODE-01:
    // Se uniforma la declaración del método config().
    config(): void {

        // MITIGACIÓN CODE-02:
        // Se organiza el formato de las rutas.
        // Consultar todas las promociones.
        this.router.get(
            '/mostrarTodasPromociones/',
            promocionesController.mostrarTodasPromociones
        );

        // Agregar nuevas promociones.
        this.router.post(
            '/agregarPromociones/',
            promocionesController.agregarPromociones
        );

        // Eliminar una promoción mediante su identificador.
        this.router.delete(
            '/eliminarPromocion/:id',
            promocionesController.eliminarPromocion
        );
    }
}

const promocionesRoutes = new PromocionesRoutes();

export default promocionesRoutes.router;

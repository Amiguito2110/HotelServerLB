import { Router } from 'express';
import { promocionesController } from '../controllers/promocionesController';

class PromocionesRoutes {

    public router: Router = Router();

    constructor() {
        this.config();
    }

    config() : void{

        this.router.get('/mostrarTodasPromociones/',promocionesController.mostrarTodasPromociones);
        this.router.post('/agregarPromociones/',  promocionesController.agregarPromociones);
        this.router.delete('/eliminarPromocion/:id',  promocionesController.eliminarPromocion);

    }
}

const promocionesRoutes = new PromocionesRoutes();
export default promocionesRoutes.router;

import { Router } from 'express';
import { habitacionesController } from '../controllers/habitacionesController';
import { validarToken } from '../middleware/auth';

class HabitacionesRoutes{

    public router: Router = Router();
    constructor(){
        this.config();
    }

    config() : void{
        this.router.put('/actualizar_habitacion/:id', habitacionesController.actualizar_habitacion);
        this.router.post('/crear_habitacion/',  habitacionesController.crear_habitacion);
        this.router.delete('/eliminar_habitacion/:id', habitacionesController.eliminar_habitacion);
        this.router.get('/mostrar_habitacion/:id', habitacionesController.mostrar_habitacion);
        this.router.get('/mostrar_todas_habitaciones/', habitacionesController.mostrar_todas_habitaciones);
        this.router.get('/total_habitaciones/',habitacionesController.total_habitaciones);
        this.router.post('/insertar_datos_foto/',  habitacionesController.inserta_datos_foto);
        this.router.get('/id_fotos_por_habitacion/:id', habitacionesController.id_fotos_por_habitacion);
        this.router.get('/fotoPrincipal_por_Idhabitacion/:id', habitacionesController.fotoPrincipal_by_Idhabitacion);
        this.router.delete('/eliminar_datos_foto/:id', habitacionesController.eliminar_datos_foto);

    }
}

const habitacionesRoutes = new HabitacionesRoutes();
export default habitacionesRoutes.router;
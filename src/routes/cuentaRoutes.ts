import { Router } from 'express';
import { cuentaController } from '../controllers/cuentaController';
import { validarToken } from '../middleware/auth';

class RolesRoutes{
    public router: Router = Router();
    constructor(){
        this.config();
    }

    config() : void{
        this.router.put('/actualizar_cuenta/:id', cuentaController.actualizar_cuenta);
        this.router.put('/crear_cuenta/', cuentaController.crear_cuenta);
        this.router.delete('/eliminar_cuenta/:id', cuentaController.eliminar_cuenta);
        this.router.get('/mostrar_cuenta/:id', cuentaController.mostrar_cuenta);
        this.router.get('/mostrar_todas_cuentas/', cuentaController.mostrar_todas_cuentas);
        this.router.post('/validar_cuenta/', cuentaController.validar_cuenta); // validarToken eliminado para pruebas
        this.router.post('/correo_existe/', cuentaController.correo_existe);
        this.router.get('/correo_existe2/:correo2', cuentaController.correo_existe2);
        this.router.get('/correos_usuarios/', cuentaController.mostrar_correos_usuarios);
        this.router.put('/actualizarFoto/:id',cuentaController.actualizarFoto);
        this.router.put('/set_foto_cero/:id',cuentaController.set_foto_cero);
    }
}

const rolesRoutes = new RolesRoutes();
export default rolesRoutes.router;
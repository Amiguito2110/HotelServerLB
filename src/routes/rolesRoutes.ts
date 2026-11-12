import { Router } from 'express';
import { rolesController } from '../controllers/rolesController';

// MITIGACIÓN CODE-01:
// Se conserva comentada la importación que no se utiliza.
// import { validarToken } from '../middleware/auth';

class RolesRoutes {

    // MITIGACIÓN CODE-03:
    // Se organiza la declaración del router.
    public router: Router = Router();

    constructor() {
        this.config();
    }

    config(): void {

        // MITIGACIÓN CODE-02:
        // Se eliminó la ruta de prueba comentada.

        // Ruta para consultar todos los roles.
        this.router.get(
            '/mostrarTodosRoles/',
            rolesController.mostrar_todos_roles
        );

        // Ruta para consultar un rol por su identificador.
        this.router.get(
            '/obtenerRol/:id',
            rolesController.listOne
        );

        // Ruta para registrar un rol.
        this.router.post(
            '/crearRol/',
            rolesController.createRol
        );

        // Ruta para actualizar un rol.
        this.router.put(
            '/actualizarRol/:id',
            rolesController.actualizarRol
        );

        // Ruta para eliminar un rol.
        this.router.delete(
            '/eliminarRol/:id',
            rolesController.eliminarRol
        );
    }
}

const rolesRoutes = new RolesRoutes();

export default rolesRoutes.router;

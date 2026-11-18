
import { Router } from 'express';
import { rolesController } from '../controllers/rolesController';

// SEGURIDAD [AUTH-07]:
// Middleware que verifica la autenticación JWT.
import { validarToken } from '../middleware/auth';

// SEGURIDAD [AUTH-08]:
// Middleware que consulta permisos desde MySQL.
import { autorizarRoles, RolUsuario } from '../middleware/autorizarRoles';

class RolesRoutes {

    public router: Router = Router();

    constructor() {
        this.config();
    }

    config(): void {

        // SEGURIDAD [AUTH-07, AUTH-08, AUTH-09]:
        // Solo un Administrador autenticado puede
        // consultar el catálogo de roles.
        this.router.get(
            '/mostrarTodosRoles/',
            validarToken,
            autorizarRoles(RolUsuario.ADMINISTRADOR),
            rolesController.mostrar_todos_roles
        );

        // PENDIENTE [AUTH-09]:
        // Estas rutas necesitan autorización propia.
        // Se conservaron durante esta primera prueba,
        // pero NO deben quedar expuestas en producción.

        this.router.get(
            '/obtenerRol/:id',
            rolesController.listOne
        );

        this.router.post(
            '/crearRol/',
            rolesController.createRol
        );

        this.router.put(
            '/actualizarRol/:id',
            rolesController.actualizarRol
        );

        this.router.delete(
            '/eliminarRol/:id',
            rolesController.eliminarRol
        );
    }
}

const rolesRoutes = new RolesRoutes();

export default rolesRoutes.router;

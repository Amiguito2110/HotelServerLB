
import { Router, Request, Response, NextFunction } from 'express';

import { rolesController } from '../controllers/rolesController';

// SEGURIDAD [AUTH-10, AUTH-11, AUTH-12, AUTH-13]:
// Middleware de autenticación JWT.
import { validarToken } from '../middleware/auth';

// SEGURIDAD [AUTH-11, AUTH-12, AUTH-13]:
// Middleware de autorización por roles desde MySQL.
import { autorizarRoles, RolUsuario } from '../middleware/autorizarRoles';


// SEGURIDAD [VAL-03]:
// Validar que el identificador del rol sea
// un número entero positivo y seguro.
const validarIdRol = (
    req: Request,
    res: Response,
    next: NextFunction
): void => {

    const { id } = req.params;

    if (!/^[1-9]\d*$/.test(id)) {
        res.status(400).json({
            mensaje: 'Identificador de rol inválido.'
        });
        return;
    }

    const idNumerico = Number(id);

    if (!Number.isSafeInteger(idNumerico)) {
        res.status(400).json({
            mensaje: 'Identificador de rol inválido.'
        });
        return;
    }

    next();
};


class RolesRoutes {

    public router: Router = Router();

    constructor() {
        this.config();
    }

    config(): void {

        // ==========================================
        // SEGURIDAD [DESIGN-01]:
        // PROTECCIÓN GENERAL DEL MÓDULO DE ROLES
        // ==========================================

        // SEGURIDAD [AUTH-10, AUTH-11, AUTH-12, AUTH-13]:
        // Todas las rutas registradas a continuación
        // requieren un JWT válido.
        this.router.use(validarToken);

        // SEGURIDAD [AUTH-11, AUTH-12, AUTH-13]:
        // Solo un Administrador (Rol 1) puede acceder
        // a las operaciones de este módulo.
        // El rol se consulta desde MySQL.
        this.router.use(
            autorizarRoles(RolUsuario.ADMINISTRADOR)
        );

        // ==========================================
        // CONSULTAR TODOS LOS ROLES
        // ==========================================

        // SEGURIDAD [DESIGN-01]:
        // Protegida por los middlewares generales.
        this.router.get(
            '/mostrarTodosRoles/',
            rolesController.mostrar_todos_roles
        );

        // ==========================================
        // CONSULTAR UN ROL
        // ==========================================

        // SEGURIDAD [AUTH-10, VAL-03]:
        // Requiere autenticación, rol administrativo
        // y un identificador válido.
        this.router.get(
            '/obtenerRol/:id',
            validarIdRol,
            rolesController.listOne
        );

        // ==========================================
        // CREAR UN ROL
        // ==========================================

        // SEGURIDAD [AUTH-11]:
        // Solo el Administrador puede crear roles.
        // La validación del body corresponde al controller.
        this.router.post(
            '/crearRol/',
            rolesController.createRol
        );

        // ==========================================
        // ACTUALIZAR UN ROL
        // ==========================================

        // SEGURIDAD [AUTH-12, VAL-03]:
        // Autenticación y autorización generales.
        // Se valida además el ID recibido.
        this.router.put(
            '/actualizarRol/:id',
            validarIdRol,
            rolesController.actualizarRol
        );

        // ==========================================
        // ELIMINAR UN ROL
        // ==========================================

        // SEGURIDAD [AUTH-13, VAL-03]:
        // Acceso administrativo y validación de ID.
        this.router.delete(
            '/eliminarRol/:id',
            validarIdRol,
            rolesController.eliminarRol
        );
    }
}

const rolesRoutes = new RolesRoutes();

export default rolesRoutes.router;

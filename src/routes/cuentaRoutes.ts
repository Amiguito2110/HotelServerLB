import { Router, Request, Response, NextFunction } from 'express';
import { cuentaController } from '../controllers/cuentaController';
import { validarToken } from '../middleware/auth';
import { autorizarRoles, RolUsuario } from '../middleware/autorizarRoles';
// SEGURIDAD [AUTH-CUENTA-01]:
// Nuevo middleware para comprobar la propiedad.
import { autorizarCuentaPropiaOAdmin } from '../middleware/autorizarCuenta';


// SEGURIDAD [VAL-01]:
// Validación de identificadores de cuentas.
const validarIdCuenta = (
    req: Request,
    res: Response,
    next: NextFunction
): void => {

    const { id } = req.params;

    if (!/^[1-9]\d*$/.test(id)) {
        res.status(400).json({
            mensaje: 'Identificador de cuenta inválido.'
        });
        return;
    }

    const idNumerico = Number(id);

    if (!Number.isSafeInteger(idNumerico)) {
        res.status(400).json({
            mensaje: 'Identificador de cuenta inválido.'
        });
        return;
    }

    next();
};


// SEGURIDAD [HTTP-01]:
// Evitar almacenamiento de respuestas sensibles.
const evitarCache = (
    req: Request,
    res: Response,
    next: NextFunction
): void => {

    res.setHeader('Cache-Control', 'no-store');
    next();
};


class CuentaRoutes {

    public router: Router = Router();

    constructor() {
        this.config();
    }

    config(): void {

        // ==========================================
        // ACTUALIZACIÓN DE CUENTAS
        // ==========================================

        // SEGURIDAD [AUTH-CUENTA-01]:
        // Solo propietario o Administrador.
        this.router.put(
            '/actualizar_cuenta/:id',
            evitarCache,
            validarToken,
            validarIdCuenta,
            autorizarCuentaPropiaOAdmin,
            cuentaController.actualizar_cuenta
        );


        // ==========================================
        // REGISTRO PÚBLICO DE CUENTAS
        // ==========================================

        // SEGURIDAD [PRIV-01]:
        // Registro público únicamente para Clientes.
        // IMPORTANTE: el controller debe imponer Rol = 3.
        this.router.put(
            '/crear_cuenta/',
            evitarCache,
            cuentaController.crear_cuenta
        );


        // ==========================================
        // CREACIÓN DE RECEPCIONISTAS
        // ==========================================

        // SEGURIDAD [AUTH-ADMIN-01]:
        // CONSERVAMOS TU ENDPOINT YA IMPLEMENTADO.
        // Solo Administradores pueden crear recepcionistas.
        this.router.put(
            '/crear_recepcionista/',
            evitarCache,
            validarToken,
            autorizarRoles(RolUsuario.ADMINISTRADOR),
            cuentaController.crear_recepcionista
        );


        // ==========================================
        // ELIMINACIÓN DE CUENTAS
        // ==========================================

        // SEGURIDAD [AUTH-ADMIN-02]:
        // Solo Administradores pueden eliminar cuentas.
        this.router.delete(
            '/eliminar_cuenta/:id',
            evitarCache,
            validarToken,
            validarIdCuenta,
            autorizarRoles(RolUsuario.ADMINISTRADOR),
            cuentaController.eliminar_cuenta
        );


        // ==========================================
        // CONSULTA DE CUENTAS
        // ==========================================

        // SEGURIDAD [AUTH-CUENTA-02]:
        // Consultar cuenta propia o siendo Administrador.
        this.router.get(
            '/mostrar_cuenta/:id',
            evitarCache,
            validarToken,
            validarIdCuenta,
            autorizarCuentaPropiaOAdmin,
            cuentaController.mostrar_cuenta
        );


        // SEGURIDAD [AUTH-ADMIN-03]:
        // Listado reservado para Administradores.
        this.router.get(
            '/mostrar_todas_cuentas/',
            evitarCache,
            validarToken,
            autorizarRoles(RolUsuario.ADMINISTRADOR),
            cuentaController.mostrar_todas_cuentas
        );


        // ==========================================
        // INICIO DE SESIÓN
        // ==========================================

        // SEGURIDAD [JWT-LOGIN]:
        // El inicio de sesión debe continuar siendo público.
        this.router.post(
            '/validar_cuenta/',
            evitarCache,
            cuentaController.validar_cuenta
        );


        // ==========================================
        // COMPROBACIÓN DE CORREOS
        // ==========================================

        // PENDIENTE [ENUM-01]:
        // Limitar intentos y evitar enumeración de cuentas.
        this.router.post(
            '/correo_existe/',
            evitarCache,
            cuentaController.correo_existe
        );


        this.router.get(
            '/correo_existe2/:correo2',
            evitarCache,
            cuentaController.correo_existe2
        );


        // ==========================================
        // CORREOS DE USUARIOS
        // ==========================================

        // SEGURIDAD [AUTH-ADMIN-04]:
        // Acceso exclusivo de Administradores.
        this.router.get(
            '/correos_usuarios/',
            evitarCache,
            validarToken,
            autorizarRoles(RolUsuario.ADMINISTRADOR),
            cuentaController.mostrar_correos_usuarios
        );


        // ==========================================
        // FOTOGRAFÍAS DE CUENTAS
        // ==========================================

        // SEGURIDAD [AUTH-CUENTA-03]:
        // Modificación de fotografía propia o Admin.
        this.router.put(
            '/actualizarFoto/:id',
            evitarCache,
            validarToken,
            validarIdCuenta,
            autorizarCuentaPropiaOAdmin,
            cuentaController.actualizarFoto
        );


        // SEGURIDAD [AUTH-CUENTA-04]:
        // Eliminación de fotografía propia o Admin.
        this.router.put(
            '/set_foto_cero/:id',
            evitarCache,
            validarToken,
            validarIdCuenta,
            autorizarCuentaPropiaOAdmin,
            cuentaController.set_foto_cero
        );


        // ==========================================
        // PRUEBA TEMPORAL JWT
        // ==========================================

        // SEGURIDAD [JWT-TEST]:
        // Conservar temporalmente para pruebas.
        this.router.get(
            '/verificar-token/',
            evitarCache,
            validarToken,
            (req: Request, res: Response): void => {

                res.json({
                    mensaje: 'Token válido.',
                    idCuenta:
                        res.locals.usuarioAutenticado.idCuenta
                });
            }
        );
    }
}

const cuentaRoutes = new CuentaRoutes();

export default cuentaRoutes.router;

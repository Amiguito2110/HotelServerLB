
import { Router, Request, Response, NextFunction } from 'express';
import { cuentaController } from '../controllers/cuentaController';
import { validarToken } from '../middleware/auth';

// SEGURIDAD [CODE-01]:
// Se elimina temporalmente la importación de validarToken.
// La autenticación se integrará cuando el middleware JWT
// y la autorización por roles estén correctamente implementados.

// SEGURIDAD [VAL-01]:
// Middleware para validar identificadores de cuentas.
// Solo permite enteros positivos y seguros.
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
// Evita que las respuestas sensibles se almacenen
// en cachés HTTP que respeten esta cabecera.
const evitarCache = (
    req: Request,
    res: Response,
    next: NextFunction
): void => {

    res.setHeader('Cache-Control', 'no-store');
    next();
};

// MEJORA [CODE-02]:
// Nombre de la clase relacionado con su funcionalidad.
class CuentaRoutes {

    public router: Router = Router();

    constructor() {
        this.config();
    }

    config(): void {

        // ==========================================
        // ACTUALIZACIÓN DE CUENTAS
        // ==========================================

        // SEGURIDAD [VAL-01, HTTP-01]:
        // Se valida el ID y se desactiva la caché.
        // PENDIENTE [AUTH-01, AUTH-02]:
        // Comprobar identidad y permisos sobre la cuenta.
        this.router.put(
            '/actualizar_cuenta/:id',
            validarIdCuenta,
            evitarCache,
            cuentaController.actualizar_cuenta
        );

        // ==========================================
        // REGISTRO DE CUENTAS
        // ==========================================

        // PENDIENTE [PRIV-01]:
        // El registro público deberá asignar Rol = 3
        // desde el controller, ignorando el rol enviado.
        // La creación de recepcionistas requiere
        // un endpoint administrativo independiente.
        this.router.put(
            '/crear_cuenta/',
            evitarCache,
            cuentaController.crear_cuenta
        );

        // ==========================================
        // ELIMINACIÓN DE CUENTAS
        // ==========================================

        // SEGURIDAD [VAL-01]:
        // Valida el identificador antes del controlador.
        // PENDIENTE [AUTH-01, AUTH-02]:
        // Restringir la eliminación a usuarios autorizados.
        this.router.delete(
            '/eliminar_cuenta/:id',
            validarIdCuenta,
            cuentaController.eliminar_cuenta
        );

        // ==========================================
        // CONSULTA DE CUENTAS
        // ==========================================

        // SEGURIDAD [VAL-01, HTTP-01]:
        // ID validado y respuesta sin caché.
        // PENDIENTE [AUTH-02, DATA-01]:
        // Verificar permisos de acceso a los datos.
        this.router.get(
            '/mostrar_cuenta/:id',
            validarIdCuenta,
            evitarCache,
            cuentaController.mostrar_cuenta
        );

        // SEGURIDAD [HTTP-01]:
        // Evitar caché de información de cuentas.
        // PENDIENTE [AUTH-01, DATA-01]:
        // Restringir a los roles administrativos.
        this.router.get(
            '/mostrar_todas_cuentas/',
            evitarCache,
            cuentaController.mostrar_todas_cuentas
        );

        // ==========================================
        // INICIO DE SESIÓN
        // ==========================================

        // SEGURIDAD [HTTP-01]:
        // Evita almacenar la respuesta en caché.
        // Este endpoint debe permanecer accesible
        // sin token para permitir el inicio de sesión.
        this.router.post(
            '/validar_cuenta/',
            evitarCache,
            cuentaController.validar_cuenta
        );

        // ==========================================
        // COMPROBACIÓN DE CORREOS
        // ==========================================

        // SEGURIDAD [HTTP-01]:
        // Evitar caché de las respuestas.
        // PENDIENTE [ENUM-01]:
        // Limitar solicitudes y revisar las respuestas.
        this.router.post(
            '/correo_existe/',
            evitarCache,
            cuentaController.correo_existe
        );

        // PENDIENTE [ENUM-01]:
        // Valorar sustituir el correo de la URL
        // por una solicitud POST al rediseñar Angular.
        this.router.get(
            '/correo_existe2/:correo2',
            evitarCache,
            cuentaController.correo_existe2
        );

        // ==========================================
        // CORREOS DE USUARIOS
        // ==========================================

        // SEGURIDAD [HTTP-01]:
        // Evitar caché de información sensible.
        // PENDIENTE [AUTH-01, DATA-01]:
        // Restringir el listado de correos.
        this.router.get(
            '/correos_usuarios/',
            evitarCache,
            cuentaController.mostrar_correos_usuarios
        );

        // ==========================================
        // FOTOGRAFÍAS DE CUENTAS
        // ==========================================

        // SEGURIDAD [VAL-01]:
        // Verificar que el ID sea válido.
        // PENDIENTE [AUTH-02]:
        // Validar que pueda modificar la fotografía.
        this.router.put(
            '/actualizarFoto/:id',
            validarIdCuenta,
            evitarCache,
            cuentaController.actualizarFoto
        );

        // SEGURIDAD [VAL-01]:
        // Verificar que el ID sea válido.
        // PENDIENTE [AUTH-02]:
        // Verificar la propiedad de la cuenta.
        this.router.put(
            '/set_foto_cero/:id',
            validarIdCuenta,
            evitarCache,
            cuentaController.set_foto_cero
        );

        // SEGURIDAD [JWT-TEST]: Ruta temporal para probar JWT.
        this.router.get(
            '/verificar-token/',
            validarToken,
            (req: Request, res: Response) => {
                res.json({
                    mensaje: 'Token válido.',
                    idCuenta: res.locals.usuarioAutenticado.idCuenta
                });
            }
        );
    }
}

// MEJORA [CODE-02]:
// Se utiliza un nombre descriptivo.
const cuentaRoutes = new CuentaRoutes();

export default cuentaRoutes.router;

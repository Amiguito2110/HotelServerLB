
import {
    Router,
    Request,
    Response,
    NextFunction
} from 'express';

import {
    disponibilidadporfechaController
} from '../controllers/disponibilidadporfechaController';

// SEGURIDAD [DISP-AUTH-01]:
// Middleware de autenticación JWT.
import { validarToken } from '../middleware/auth';

// SEGURIDAD [DISP-AUTH-01]:
// Middleware de autorización desde MySQL.
import {
    autorizarRoles,
    RolUsuario
} from '../middleware/autorizarRoles';


// SEGURIDAD [DISP-HTTP-01]:
// Evitar almacenar respuestas de disponibilidad
// que podrían quedar desactualizadas.
const evitarCache = (
    _req: Request,
    res: Response,
    next: NextFunction
): void => {

    res.setHeader('Cache-Control', 'no-store');
    next();
};


class DisponibilidadporFechaRoutes {

    public router: Router = Router();

    constructor() {
        this.config();
    }

    config(): void {

        // ==========================================
        // CONSULTAR DISPONIBILIDAD
        // ==========================================

        // SEGURIDAD [DISP-VAL-01]:
        // Consulta pública.
        // El controller validará la fecha.
        this.router.get(
            '/mostrar_disponibilidad_fecha/:fecha',
            evitarCache,
            disponibilidadporfechaController.mostrar_disponibilidad_fecha
        );


        // ==========================================
        // AGREGAR DISPONIBILIDAD
        // ==========================================

        // SEGURIDAD [DISP-AUTH-01]:
        // Requiere JWT válido y Rol Administrador.
        // El rol se consulta desde MySQL.
        this.router.post(
            '/agregar_disponibilidad/',
            evitarCache,
            validarToken,
            autorizarRoles(RolUsuario.ADMINISTRADOR),
            disponibilidadporfechaController.agregar_disponibilidad
        );
    }
}

const disponibilidadporFechaRoutes =
    new DisponibilidadporFechaRoutes();

export default disponibilidadporFechaRoutes.router;

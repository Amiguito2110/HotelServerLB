
import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import dotenv from 'dotenv';

// SEGURIDAD [CONF-01]:
// Cargar las variables de entorno una sola vez.
dotenv.config();

// SEGURIDAD [JWT-02]:
// La clave secreta es obligatoria.
// Debe ser un valor hexadecimal aleatorio de 64 caracteres,
// generado a partir de 32 bytes criptográficamente seguros.
const secreto = process.env.TOKEN_SECRET;

if (!secreto || !/^[0-9a-fA-F]{64}$/.test(secreto)) {
    throw new Error(
        'TOKEN_SECRET debe contener 64 caracteres hexadecimales ' +
        'generados de forma segura.'
    );
}

const TOKEN_SECRET: string = secreto;

// SEGURIDAD [JWT-03, JWT-04]:
// Configuración compartida para generar y verificar JWT.
const JWT_ALGORITMO = 'HS256';
const JWT_EMISOR = 'hotel-campestre-api';
const JWT_AUDIENCIA = 'hotel-campestre-web';
const JWT_DURACION = '20m';

// SEGURIDAD [JWT-05]:
// Generar exclusivamente tokens de acceso.
// Se llamará después de verificar correo y contraseña.
export const generarTokenAcceso = (idCuenta: number): string => {

    if (!Number.isSafeInteger(idCuenta) || idCuenta <= 0) {
        throw new Error('Identificador de cuenta inválido.');
    }

    return jwt.sign(
        {
            tokenUse: 'access'
        },
        TOKEN_SECRET,
        {
            algorithm: JWT_ALGORITMO,
            expiresIn: JWT_DURACION,
            issuer: JWT_EMISOR,
            audience: JWT_AUDIENCIA,
            subject: String(idCuenta)
        }
    );
};

// SEGURIDAD [ERR-01]:
// Respuesta uniforme cuando falla la autenticación.
const rechazarToken = (res: Response): void => {
    res.setHeader('WWW-Authenticate', 'Bearer');

    res.status(401).json({
        mensaje: 'Token ausente o inválido.'
    });
};

// SEGURIDAD [JWT-01, JWT-03, JWT-04, JWT-05]:
// Middleware para verificar el token de acceso.
export const validarToken = (
    req: Request,
    res: Response,
    next: NextFunction
): void => {

    // SEGURIDAD [JWT-01]:
    // Leer Authorization: Bearer <token>.
    const authorization = req.headers.authorization;

    if (typeof authorization !== 'string') {
        rechazarToken(res);
        return;
    }

    // SEGURIDAD [VAL-01]:
    // Validar el formato del encabezado recibido.
    const coincidencia = /^Bearer\s+(\S+)$/i.exec(
        authorization.trim()
    );

    if (!coincidencia) {
        rechazarToken(res);
        return;
    }

    const token = coincidencia[1];

    try {
        // SEGURIDAD [JWT-03, JWT-04]:
        // Verificar firma, algoritmo, emisor, audiencia
        // y tiempo de validez.
        const payload = jwt.verify(
            token,
            TOKEN_SECRET,
            {
                algorithms: [JWT_ALGORITMO],
                issuer: JWT_EMISOR,
                audience: JWT_AUDIENCIA,
                maxAge: JWT_DURACION,
                clockTolerance: 5
            }
        );

        // SEGURIDAD [JWT-05]:
        // Aceptar únicamente tokens de acceso con
        // identidad y expiración válidas.
        if (
            typeof payload === 'string' ||
            payload.tokenUse !== 'access' ||
            typeof payload.sub !== 'string' ||
            typeof payload.exp !== 'number' ||
            typeof payload.iat !== 'number' ||
            !/^[1-9]\d*$/.test(payload.sub)
        ) {
            rechazarToken(res);
            return;
        }

        const idCuenta = Number(payload.sub);

        if (!Number.isSafeInteger(idCuenta)) {
            rechazarToken(res);
            return;
        }

        // SEGURIDAD [AUTH-01]:
        // Conservar la identidad verificada para los
        // siguientes middlewares y controladores.
        // Nunca se obtiene desde localStorage o req.body.
        res.locals.usuarioAutenticado = {
            idCuenta
        };

        // SEGURIDAD [ERR-01]:
        // Solo continuar si todas las verificaciones pasan.
        next();

    } catch (error) {
        // SEGURIDAD [LOG-01, ERR-01]:
        // No imprimir el token, la clave secreta ni datos
        // sensibles de la autenticación.
        rechazarToken(res);
        return;
    }
};

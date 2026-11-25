import express, { Application, Request, Response, NextFunction } from 'express';
import morgan from 'morgan';
import cors from 'cors';
import dotenv from 'dotenv';
import fs from 'fs/promises';
import path from 'path';
import { randomUUID } from 'crypto';
import sharp from 'sharp';
import pool from './database';
import { validarToken } from './middleware/auth';

// SEGURIDAD [IMG-01]: lista cerrada de carpetas, sin rutas construidas libremente.
const CARPETAS_PERMITIDAS = ['usuarios', 'habitaciones'] as const;
type Carpeta = typeof CARPETAS_PERMITIDAS[number];
const RAIZ_IMAGENES = path.resolve(__dirname, 'imagenes');
const MAX_BYTES = 5 * 1024 * 1024; // Imagen de entrada: máximo 5 MiB.
const MAX_PIXELES = 16_000_000; // Mitiga descompresión de imágenes gigantes.

function validarCarpeta(valor: unknown): Carpeta | null {
    return typeof valor === 'string' &&
        (CARPETAS_PERMITIDAS as readonly string[]).includes(valor)
        ? valor as Carpeta : null;
}

function validarId(valor: unknown): number | null {
    if (typeof valor !== 'string' && typeof valor !== 'number') return null;
    const cadena = String(valor);
    if (!/^[1-9]\d*$/.test(cadena)) return null;
    const id = Number(cadena);
    return Number.isSafeInteger(id) ? id : null;
}

// SEGURIDAD [IMG-02]: se reutiliza el JWT del servidor principal.
// Para usuarios: dueño de la cuenta o Administrador.
// Para habitaciones: exclusivamente Administrador.
async function autorizarImagen(req: Request, res: Response, next: NextFunction): Promise<void> {
    const tipo = validarCarpeta(req.body?.tipo);
    const id = validarId(req.body?.id);
    if (!tipo || id === null) {
        res.status(400).json({ mensaje: 'Tipo o identificador inválido.' });
        return;
    }
    const idAutenticado = validarId(res.locals.usuarioAutenticado?.idCuenta);
    if (idAutenticado === null) {
        res.status(401).json({ mensaje: 'Sesión no válida.' });
        return;
    }
    if (tipo === 'usuarios' && id === idAutenticado) {
        next();
        return;
    }
    try {
        // El rol se lee de MySQL y no de req.body ni del localStorage de Angular.
        const filas = await pool.query(
            'SELECT Rol FROM cuenta WHERE IDCuenta = ? LIMIT 1',
            [idAutenticado]
        );
        if (filas.length === 0 || Number(filas[0].Rol) !== 1) {
            res.status(403).json({ mensaje: 'No tienes permiso para administrar esta imagen.' });
            return;
        }
        next();
    } catch (error) {
        console.error('[Imagenes] Fallo verificando permisos.');
        res.status(500).json({ mensaje: 'Error interno del servidor.' });
    }
}

function detectarFormato(buffer: Buffer): 'jpeg' | 'png' | 'webp' | null {
    if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
        return 'jpeg';
    }
    if (buffer.length >= 8 && buffer.subarray(0, 8).equals(
        Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
    )) {
        return 'png';
    }
    if (buffer.length >= 12 && buffer.toString('ascii', 0, 4) === 'RIFF' &&
        buffer.toString('ascii', 8, 12) === 'WEBP') {
        return 'webp';
    }
    return null;
}

// SEGURIDAD [IMG-03]: MIME declarado + Magic Numbers + decodificación real.
// Todas las imágenes aceptadas se vuelven a codificar a JPG, conservando
// el contrato actual con Angular: /usuarios/ID.jpg y /habitaciones/ID.jpg.
async function procesarImagen(src: unknown): Promise<Buffer | null> {
    if (typeof src !== 'string') return null;
    // Evitar decodificar Base64 mayor al límite; 5 MiB ocupa ~6.7 MiB codificados.
    if (src.length > 7_100_000) return null;
    const coincidencia = /^data:image\/(jpeg|jpg|png|webp);base64,([A-Za-z0-9+/]+={0,2})$/.exec(src);
    if (!coincidencia) return null;
    const b64 = coincidencia[2];
    const formatoDeclarado = coincidencia[1] === 'jpg' ? 'jpeg' : coincidencia[1];
    const original = Buffer.from(b64, 'base64');
    if (!original.length || original.length > MAX_BYTES ||
        original.toString('base64') !== b64) return null;
    const formatoReal = detectarFormato(original);
    if (!formatoReal || formatoReal !== formatoDeclarado) return null;

    try {
        const procesador = sharp(original, { limitInputPixels: MAX_PIXELES, failOn: 'error' });
        const metadata = await procesador.metadata();
        if (metadata.format !== formatoReal || !metadata.width || !metadata.height ||
            metadata.width * metadata.height > MAX_PIXELES) return null;
        // Al reconstruir el JPEG, se desechan los metadatos EXIF y contenido agregado.
        return await procesador.rotate().jpeg({ quality: 85 }).toBuffer();
    } catch {
        return null;
    }
}

class Server {
    public app: Application;

    constructor() {
        dotenv.config();
        this.app = express();
        this.config();
        this.routes();
        // Se mantiene la lectura pública de las imágenes (como el frontend actual).
        // Solo se exponen los dos directorios de imágenes, no cualquier archivo.
        for (const carpeta of CARPETAS_PERMITIDAS) {
            this.app.use('/' + carpeta, express.static(path.join(RAIZ_IMAGENES, carpeta), {
                index: false,
                dotfiles: 'deny',
                setHeaders: (res) => {
                    res.setHeader('X-Content-Type-Options', 'nosniff');
                }
            }));
        }
        this.app.use((error: any, _req: Request, res: Response, next: NextFunction) => {
            if (error && error.type === 'entity.too.large') {
                res.status(413).json({ mensaje: 'La imagen supera el tamaño permitido.' });
                return;
            }
            if (error && error instanceof SyntaxError && 'body' in error) {
                res.status(400).json({ mensaje: 'JSON inválido.' });
                return;
            }
            next(error);
        });
    }

    config(): void {
        this.app.set('port', process.env.PORTO || 3002);
        this.app.use(morgan('dev'));
        // CORS no sustituye la autenticación; ajustar origin en despliegue.
        this.app.use(cors());
        this.app.use(express.json({ limit: '8mb' }));
    }

    routes(): void {
        // SEGURIDAD [IMG-AUTH-01]: el token y la propiedad se comprueban
        // ANTES de interpretar la imagen y escribir el archivo.
        this.app.post('/uploadImagen', validarToken, autorizarImagen,
            async (req: Request, res: Response): Promise<void> => {
                const tipo = validarCarpeta(req.body.tipo)!;
                const id = validarId(req.body.id)!;
                const contenido = await procesarImagen(req.body.src);
                if (!contenido) {
                    res.status(415).json({ mensaje: 'Imagen inválida. Usa JPEG, PNG o WebP hasta 5 MiB.' });
                    return;
                }
                const carpeta = path.join(RAIZ_IMAGENES, tipo);
                const archivo = path.join(carpeta, `${id}.jpg`);
                const temporal = path.join(carpeta, `.${id}-${randomUUID()}.tmp`);
                try {
                    await fs.mkdir(carpeta, { recursive: true });
                    await fs.writeFile(temporal, contenido, { flag: 'wx', mode: 0o600 });
                    await fs.rename(temporal, archivo);
                    // COMPATIBILIDAD: se conserva la propiedad fileName.
                    res.status(200).json({ fileName: `${id}.jpg` });
                } catch (error) {
                    await fs.unlink(temporal).catch(() => undefined);
                    console.error('[Imagenes] Fallo al guardar imagen.');
                    res.status(500).json({ mensaje: 'No se pudo guardar la imagen.' });
                }
            }
        );

        // Se conserva POST /deleteImagen porque así lo utiliza ImagenesService.
        this.app.post('/deleteImagen', validarToken, autorizarImagen,
            async (req: Request, res: Response): Promise<void> => {
                const tipo = validarCarpeta(req.body.tipo)!;
                const id = validarId(req.body.id)!;
                const archivo = path.join(RAIZ_IMAGENES, tipo, `${id}.jpg`);
                try {
                    await fs.unlink(archivo);
                    res.status(200).json({ mensaje: 'Imagen eliminada correctamente.' });
                } catch (error) {
                    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
                        res.status(404).json({ mensaje: 'Imagen no encontrada.' });
                        return;
                    }
                    console.error('[Imagenes] Fallo al eliminar imagen.');
                    res.status(500).json({ mensaje: 'No se pudo eliminar la imagen.' });
                }
            }
        );
    }

    start(): void {
        this.app.listen(this.app.get('port'), () => {
            console.log('Servidor de imágenes en puerto', this.app.get('port'));
        });
    }
}

const server = new Server();
server.start();

import { Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import pool from '../database';
// SEGURIDAD [JWT-01]: Generar el token de acceso solamente después de validar credenciales.
import { generarTokenAcceso } from '../middleware/auth';


// SEGURIDAD [DATA-01]: Evitar SELECT * y excluir el hash de las respuestas.
const CAMPOS_PUBLICOS = 'IDCuenta, NombreCompleto, CorreoElectronico, Rol, NumeroTelefono, Foto';

// SEGURIDAD [VAL-01]: Validar IDs sin conversiones permisivas (p. ej., "12abc").
function validarId(valor: unknown): number | null {
    if (typeof valor !== 'string' || !/^[1-9]\d*$/.test(valor)) return null;
    const id = Number(valor);
    return Number.isSafeInteger(id) ? id : null;
}

// SEGURIDAD [VAL-02]: Validaciones iniciales; ajustar longitudes al esquema real.
function validarTexto(valor: unknown, maximo: number): string | null {
    if (typeof valor !== 'string') return null;
    const texto = valor.trim();
    if (!texto || texto.length > maximo || /[\u0000-\u001F\u007F]/.test(texto)) return null;
    return texto;
}

function validarCorreo(valor: unknown): string | null {
    const correo = validarTexto(valor, 254);
    if (!correo || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(correo)) return null;
    return correo;
}

function validarTelefono(valor: unknown): string | null {
    const telefono = validarTexto(valor, 25);
    if (!telefono || !/^[+0-9 ()-]{7,25}$/.test(telefono)) return null;
    return telefono;
}

function validarContrasenaNueva(valor: unknown): string | null {
    if (typeof valor !== 'string') return null;
    // SEGURIDAD [VAL-02]: bcrypt considera como máximo los primeros 72 bytes.
    if (valor.length < 8 || Buffer.byteLength(valor, 'utf8') > 72) return null;
    return valor;
}

function validarFoto(valor: unknown): number | null {
    return valor === 0 || valor === 1 ? valor : null;
}

function obtenerDatos(req: Request): Record<string, unknown> {
    return req.body && typeof req.body === 'object' && !Array.isArray(req.body)
        ? req.body as Record<string, unknown>
        : {};
}

// SEGURIDAD [ERR-01, LOG-01]: No enviar ni registrar SQL, valores sensibles o passwords.
function responderError(res: Response, operacion: string, error: unknown): void {
    const codigo = error && typeof error === 'object' && 'code' in error
        ? String((error as { code?: unknown }).code)
        : 'ERROR_DESCONOCIDO';
    console.error(`[CuentaController] ${operacion}: ${codigo}`);

    if (codigo === 'ER_DUP_ENTRY') {
        res.status(409).json({ mensaje: 'Existe un conflicto con los datos proporcionados.' });
        return;
    }
    res.status(500).json({ mensaje: 'Error interno del servidor.' });
}

class CuentaController {
    public async set_foto_cero(req: Request, res: Response): Promise<void> {
        // SEGURIDAD [VAL-01]: Validar ID y exigir que este endpoint solo ponga Foto=0.
        const id = validarId(req.params.id);
        const datos = obtenerDatos(req);
        if (id === null || datos.Foto !== 0) {
            res.status(400).json({ mensaje: 'Parámetros inválidos.' });
            return;
        }
        try {
            // SEGURIDAD [SQL-02]: Parametrizar también el ID; no interpolarlo.
            const resp = await pool.query('UPDATE cuenta SET Foto = 0 WHERE IDCuenta = ?', [id]);
            if (resp.affectedRows === 0) {
                res.status(404).json({ mensaje: 'Cuenta no encontrada.' });
                return;
            }
            res.json(resp);
        } catch (error) {
            responderError(res, 'set_foto_cero', error);
        }
    }

    public async mostrar_todas_cuentas(req: Request, res: Response): Promise<void> {
        try {
            // SEGURIDAD [DATA-01]: Nunca retornar el hash Contrasena.
            const respuesta = await pool.query(
                `SELECT ${CAMPOS_PUBLICOS} FROM cuenta WHERE Rol = ?`, [2]
            );
            res.json(respuesta);
        } catch (error) {
            responderError(res, 'mostrar_todas_cuentas', error);
        }
    }

    public async mostrar_correos_usuarios(req: Request, res: Response): Promise<void> {
        try {
            // PENDIENTE [AUTH-01]: Proteger el acceso a esta lista de correos.
            const respuesta = await pool.query(
                'SELECT CorreoElectronico FROM cuenta WHERE Rol = ?', [3]
            );
            res.json(respuesta);
        } catch (error) {
            responderError(res, 'mostrar_correos_usuarios', error);
        }
    }

    public async mostrar_cuenta(req: Request, res: Response): Promise<void> {
        // SEGURIDAD [VAL-01]: Validar el identificador de la URL.
        const id = validarId(req.params.id);
        if (id === null) {
            res.status(400).json({ mensaje: 'Identificador inválido.' });
            return;
        }
        try {
            // SEGURIDAD [DATA-01]: Proyección explícita, sin hash.
            const respuesta = await pool.query(
                `SELECT ${CAMPOS_PUBLICOS} FROM cuenta WHERE IDCuenta = ?`, [id]
            );
            if (respuesta.length === 0) {
                res.status(404).json({ Mensaje: 'Cuenta no encontrada.' });
                return;
            }
            res.json(respuesta[0]);
        } catch (error) {
            responderError(res, 'mostrar_cuenta', error);
        }
    }

    public async correo_existe(req: Request, res: Response): Promise<void> {
        // SEGURIDAD [VAL-02]: Validación explícita del correo.
        const correo = validarCorreo(obtenerDatos(req).CorreoElectronico);
        if (correo === null) {
            res.status(400).json({ mensaje: 'Correo electrónico inválido.' });
            return;
        }
        try {
            // SEGURIDAD [SQL-01]: Sustituir interpolación por parámetro ?.
            const resp = await pool.query(
                'SELECT CorreoElectronico FROM cuenta WHERE CorreoElectronico = ? LIMIT 1',
                [correo]
            );
            // COMPATIBILIDAD: Se conserva el formato de respuesta que utiliza el frontend.
            res.json(resp.length > 0 ? resp : { CorreoElectronico: '-1' });
        } catch (error) {
            responderError(res, 'correo_existe', error);
        }
    }

    public async correo_existe2(req: Request, res: Response): Promise<void> {
        const correo = validarCorreo(req.params.correo2);
        if (correo === null) {
            res.status(400).json({ mensaje: 'Correo electrónico inválido.' });
            return;
        }
        try {
            const respuesta = await pool.query(
                'SELECT CorreoElectronico FROM cuenta WHERE CorreoElectronico = ? LIMIT 1',
                [correo]
            );
            // COMPATIBILIDAD: Angular espera "1" o "0" como string.
            res.json({ isCorreoElectronico: respuesta.length > 0 ? '1' : '0' });
        } catch (error) {
            responderError(res, 'correo_existe2', error);
        }
    }

    public async crear_cuenta(req: Request, res: Response): Promise<void> {
        const datos = obtenerDatos(req);
        // SEGURIDAD [VAL-02]: Validar solamente campos permitidos.
        const nombre = validarTexto(datos.NombreCompleto, 100);
        const correo = validarCorreo(datos.CorreoElectronico);
        const telefono = validarTelefono(datos.NumeroTelefono);
        const contrasena = validarContrasenaNueva(datos.Contrasena);
        if (!nombre || !correo || !telefono || !contrasena) {
            res.status(400).json({ mensaje: 'Datos de registro inválidos.' });
            return;
        }
        try {
            // SEGURIDAD [LOG-01]: No registrar contraseñas, hashes ni salts.
            const hash = await bcrypt.hash(contrasena, 10);
            // SEGURIDAD [MASS-01, PRIV-01]: Columnas explícitas y Rol=3 asignado por el servidor.
            // IMPORTANTE: Crear recepcionistas requiere OTRO endpoint con autorización de administrador.
            const resp = await pool.query(
                'INSERT INTO cuenta (NombreCompleto, CorreoElectronico, NumeroTelefono, Contrasena, Rol) VALUES (?, ?, ?, ?, ?)',
                [nombre, correo, telefono, hash, 3]
            );
            res.json(resp); // Mantiene affectedRows para RegistroComponent.
        } catch (error) {
            responderError(res, 'crear_cuenta', error);
        }
    }


    // SEGURIDAD [AUTH-ADMIN-01, VAL-02, PRIV-01]:
    // Crear recepcionistas únicamente mediante la ruta
    // protegida con autenticación y rol Administrador.
    public async crear_recepcionista(
        req: Request,
        res: Response
    ): Promise<void> {

        const datos = obtenerDatos(req);

        const nombre = validarTexto(datos.NombreCompleto, 100);
        const correo = validarCorreo(datos.CorreoElectronico);
        const telefono = validarTelefono(datos.NumeroTelefono);
        const contrasena = validarContrasenaNueva(datos.Contrasena);

        if (!nombre || !correo || !telefono || !contrasena) {
            res.status(400).json({
                mensaje: 'Datos de registro inválidos.'
            });
            return;
        }

        try {
            const hash = await bcrypt.hash(contrasena, 10);

            // El servidor asigna Rol = 2.
            // Nunca se toma el rol desde Angular.
            const resp = await pool.query(
                `INSERT INTO cuenta
                (NombreCompleto, CorreoElectronico,
                NumeroTelefono, Contrasena, Rol)
                VALUES (?, ?, ?, ?, ?)`,
                [nombre, correo, telefono, hash, 2]
            );

            res.status(201).json({
                mensaje: 'Recepcionista creado correctamente.',
                IDCuenta: resp.insertId
            });

        } catch (error) {
            responderError(res, 'crear_recepcionista', error);
        }
    }

    public async actualizar_cuenta(req: Request, res: Response): Promise<void> {
        // SEGURIDAD [VAL-01]: Validar identificador antes de actualizar.
        const id = validarId(req.params.id);
        if (id === null) {
            res.status(400).json({ mensaje: 'Identificador inválido.' });
            return;
        }

        const datos = obtenerDatos(req);
        // SEGURIDAD [MASS-01]: Lista permitida; ignorar Rol, IDCuenta y cualquier campo extra.
        const cambios: string[] = [];
        const valores: Array<string | number> = [];
        if (datos.NombreCompleto !== undefined) {
            const nombre = validarTexto(datos.NombreCompleto, 100);
            if (!nombre) { res.status(400).json({ mensaje: 'Nombre inválido.' }); return; }
            cambios.push('NombreCompleto = ?'); valores.push(nombre);
        }
        if (datos.CorreoElectronico !== undefined) {
            const correo = validarCorreo(datos.CorreoElectronico);
            if (!correo) { res.status(400).json({ mensaje: 'Correo inválido.' }); return; }
            cambios.push('CorreoElectronico = ?'); valores.push(correo);
        }
        if (datos.NumeroTelefono !== undefined) {
            const telefono = validarTelefono(datos.NumeroTelefono);
            if (!telefono) { res.status(400).json({ mensaje: 'Teléfono inválido.' }); return; }
            cambios.push('NumeroTelefono = ?'); valores.push(telefono);
        }
        // SEGURIDAD [LOGIC-01]: No forzar hash cuando Angular actualiza solo nombre/teléfono/etc.
        if (datos.Contrasena !== undefined && datos.Contrasena !== '') {
            const contrasena = validarContrasenaNueva(datos.Contrasena);
            if (!contrasena) { res.status(400).json({ mensaje: 'Contraseña inválida.' }); return; }
            try {
                // PENDIENTE [AUTH-01]: Exigir identidad y verificación de contraseña actual.
                const hash = await bcrypt.hash(contrasena, 10);
                cambios.push('Contrasena = ?'); valores.push(hash);
            } catch (error) {
                responderError(res, 'actualizar_cuenta_hash', error);
                return;
            }
        }
        if (cambios.length === 0) {
            res.status(400).json({ mensaje: 'No hay campos permitidos para actualizar.' });
            return;
        }
        try {
            // SEGURIDAD [MASS-01, SQL-01]: SQL estructurado únicamente con columnas fijas del servidor.
            // Los valores se pasan como parámetros y no como texto SQL.
            const resp = await pool.query(
                `UPDATE cuenta SET ${cambios.join(', ')} WHERE IDCuenta = ?`,
                [...valores, id]
            );
            if (resp.affectedRows === 0) {
                res.status(404).json({ mensaje: 'Cuenta no encontrada.' });
                return;
            }
            res.json(resp);
        } catch (error) {
            responderError(res, 'actualizar_cuenta', error);
        }
    }

    public async eliminar_cuenta(req: Request, res: Response): Promise<void> {
        // SEGURIDAD [VAL-01]: Validación de identificador.
        const id = validarId(req.params.id);
        if (id === null) { res.status(400).json({ mensaje: 'Identificador inválido.' }); return; }
        try {
            const resp = await pool.query('DELETE FROM cuenta WHERE IDCuenta = ?', [id]);
            if (resp.affectedRows === 0) {
                res.status(404).json({ mensaje: 'Cuenta no encontrada.' });
                return;
            }
            res.json(resp);
        } catch (error) {
            responderError(res, 'eliminar_cuenta', error);
        }
    }

    public async validar_cuenta(req: Request, res: Response): Promise<void> {
        const datos = obtenerDatos(req);
        const correo = validarCorreo(datos.CorreoElectronico);
        const contrasena = datos.Contrasena;

        // SEGURIDAD [VAL-02]: Validar la entrada antes de consultar MySQL o llamar a bcrypt.
        if (!correo || typeof contrasena !== 'string' || contrasena.length === 0 || contrasena.length > 1024) {
            res.status(400).json({ mensaje: 'Datos de acceso inválidos.' });
            return;
        }

        try {
            // SEGURIDAD [SQL-01, DATA-01]: Consulta parametrizada; el hash solo se usa en el servidor.
            const filas = await pool.query(
                `SELECT ${CAMPOS_PUBLICOS}, Contrasena FROM cuenta WHERE CorreoElectronico = ? LIMIT 1`,
                [correo]
            );

            // SEGURIDAD [AUTH-02]: No revelar si el correo existe o la contraseña está equivocada.
            if (filas.length === 0 || typeof filas[0].Contrasena !== 'string') {
                res.status(401).json({ error: 'Credenciales incorrectas.' });
                return;
            }

            // SEGURIDAD [AUTH-03]: Verificar la contraseña antes de emitir cualquier token.
            const correcta = await bcrypt.compare(contrasena, filas[0].Contrasena);

            if (!correcta) {
                res.status(401).json({ error: 'Credenciales incorrectas.' });
                return;
            }

            // SEGURIDAD [JWT-01]: El identificador del token viene de MySQL, no de req.body.
            const idCuenta = Number(filas[0].IDCuenta);

            if (!Number.isSafeInteger(idCuenta) || idCuenta <= 0) {
                throw new Error('La cuenta no tiene un identificador válido.');
            }

            const token = generarTokenAcceso(idCuenta);

            // SEGURIDAD [DATA-01]: Nunca exponer el hash de contraseña al navegador.
            const { Contrasena: hashOmitido, ...cuentaSegura } = filas[0];

            // COMPATIBILIDAD [ANG-01]: Se conservan IDCuenta, Rol, NombreCompleto,
            // CorreoElectronico, NumeroTelefono y Foto para los componentes actuales de Angular.
            // Se agrega el campo `token`, que integraremos posteriormente con Angular.
            res.setHeader('Cache-Control', 'no-store');
            res.status(200).json({
                ...cuentaSegura,
                token,
                tokenType: 'Bearer',
                expiresIn: 20 * 60
            });

        } catch (error) {
            // SEGURIDAD [ERR-01]: No enviar errores internos ni claves de autenticación.
            responderError(res, 'validar_cuenta', error);
        }
    }

    public async actualizarFoto(req: Request, res: Response): Promise<void> {
        const id = validarId(req.params.id);
        const foto = validarFoto(obtenerDatos(req).Foto);
        // SEGURIDAD [VAL-01, VAL-02]: Validar identificador y valor Foto.
        if (id === null || foto === null) {
            res.status(400).json({ mensaje: 'Parámetros inválidos.' });
            return;
        }
        try {
            const resp = await pool.query('UPDATE cuenta SET Foto = ? WHERE IDCuenta = ?', [foto, id]);
            if (resp.affectedRows === 0) {
                res.status(404).json({ mensaje: 'Cuenta no encontrada.' });
                return;
            }
            res.json(resp);
        } catch (error) {
            responderError(res, 'actualizarFoto', error);
        }
    }
}

export const cuentaController = new CuentaController();

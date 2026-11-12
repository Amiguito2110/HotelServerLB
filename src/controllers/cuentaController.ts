import { Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import pool from '../database';

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
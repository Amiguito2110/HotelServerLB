
import { Request, Response } from 'express';
import pool from '../database';

// SEGURIDAD [VAL-02]: Límite de longitud para nombres.
// Verificar que coincida con el esquema de MySQL.
const MAX_NOMBRE_CATEGORIA = 100;

// SEGURIDAD [VAL-01]: Validación de identificadores de URL.
function validarId(valor: string): number | null {
    if (!/^[1-9]\d*$/.test(valor)) {
        return null;
    }

    const id = Number(valor);

    return Number.isSafeInteger(id) ? id : null;
}

// SEGURIDAD [VAL-02]: Validación de nombres de categorías.
function validarNombre(valor: unknown): string | null {
    if (typeof valor !== 'string') {
        return null;
    }

    const nombre = valor.trim();

    if (
        nombre.length === 0 ||
        nombre.length > MAX_NOMBRE_CATEGORIA ||
        /[\u0000-\u001F\u007F]/.test(nombre)
    ) {
        return null;
    }

    return nombre;
}

// SEGURIDAD [ERR-01]: Manejo centralizado de errores.
// Los detalles internos no se envían al cliente.
function manejarError(
    res: Response,
    operacion: string,
    error: unknown
): void {
    console.error(`Error en categorías (${operacion}):`, error);

    res.status(500).json({
        mensaje: 'Error interno del servidor.'
    });
}

class CategoriaController {

    public async agregarCategoria(
        req: Request,
        res: Response
    ): Promise<void> {

        // SEGURIDAD [VAL-02]: Validar y normalizar el nombre.
        const nombre_categoria = validarNombre(
            req.body?.nombre_categoria
        );

        if (nombre_categoria === null) {
            res.status(400).json({
                mensaje: 'Nombre de categoría inválido.'
            });
            return;
        }

        // SEGURIDAD [ERR-01]: Capturar errores de MySQL.
        try {
            // Consulta parametrizada existente: se conserva.
            const categoriaExistente = await pool.query(
                'SELECT id FROM categorias WHERE nombre_categoria = ?',
                [nombre_categoria]
            );

            if (categoriaExistente.length > 0) {
                // Se conserva el comportamiento original.
                res.json(categoriaExistente);
                return;
            }

            const crearcategoria = await pool.query(
                'INSERT INTO categorias (nombre_categoria) VALUES (?)',
                [nombre_categoria]
            );

            res.json(crearcategoria);

        } catch (error) {
            // SEGURIDAD [ERR-01]: Respuesta controlada.
            manejarError(res, 'agregarCategoria', error);
        }
    }

    public async editarCategoria(
        req: Request,
        res: Response
    ): Promise<void> {

        // SEGURIDAD [VAL-01]: Validar identificador.
        const id = validarId(req.params.id);

        if (id === null) {
            res.status(400).json({
                mensaje: 'Identificador de categoría inválido.'
            });
            return;
        }

        // SEGURIDAD [VAL-02]: Validar el nombre recibido.
        const nombre_categoria = validarNombre(
            req.body?.nombre_categoria
        );

        if (nombre_categoria === null) {
            res.status(400).json({
                mensaje: 'Nombre de categoría inválido.'
            });
            return;
        }

        // SEGURIDAD [ERR-01]: Manejo de errores.
        try {
            const resultado = await pool.query(
                'UPDATE categorias SET nombre_categoria = ? WHERE id = ?',
                [nombre_categoria, id]
            );

            if (resultado.affectedRows > 0) {
                res.json({
                    mensaje: 'Categoría actualizada correctamente.'
                });
            } else {
                res.status(404).json({
                    mensaje: 'La categoría no existe.'
                });
            }

        } catch (error) {
            manejarError(res, 'editarCategoria', error);
        }
    }

    public async eliminarCategoria(
        req: Request,
        res: Response
    ): Promise<void> {

        // SEGURIDAD [VAL-01]: Validar identificador.
        const id = validarId(req.params.id);

        if (id === null) {
            res.status(400).json({
                mensaje: 'Identificador de categoría inválido.'
            });
            return;
        }

        // SEGURIDAD [ERR-01]: Capturar errores de eliminación.
        try {
            const resultado = await pool.query(
                'DELETE FROM categorias WHERE id = ?',
                [id]
            );

            // CORRECCIÓN [RESP-01]: Responder siempre al cliente.
            if (resultado.affectedRows > 0) {
                res.status(200).json({
                    mensaje: 'Categoría eliminada correctamente.'
                });
            } else {
                res.status(404).json({
                    mensaje: 'La categoría no existe.'
                });
            }

        } catch (error) {
            manejarError(res, 'eliminarCategoria', error);
        }
    }

    public async mostrarCategorias(
        req: Request,
        res: Response
    ): Promise<void> {

        // SEGURIDAD [ERR-01]: Manejo controlado de errores.
        try {
            // MEJORA [DATA-01]: Seleccionar campos explícitos.
            const categorias = await pool.query(
                'SELECT id, nombre_categoria FROM categorias'
            );

            res.json(categorias);

        } catch (error) {
            manejarError(res, 'mostrarCategorias', error);
        }
    }
}

export const categoriaController = new CategoriaController();

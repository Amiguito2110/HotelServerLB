import { Request, Response } from 'express';
import pool from '../database';

// SEGURIDAD [VAL-01]: evita identificadores negativos, decimales y fuera de rango.
function validarId(valor: unknown): number | null {
    if ((typeof valor !== 'string' && typeof valor !== 'number') ||
        !/^[1-9]\d*$/.test(String(valor))) {
        return null;
    }
    const id = Number(valor);
    return Number.isSafeInteger(id) ? id : null;
}

// SEGURIDAD [VAL-02]: validar cadenas sin aceptar objetos, arreglos o textos vacíos.
function validarTexto(valor: unknown, longitudMaxima = 150): string | null {
    if (typeof valor !== 'string') return null;
    const texto = valor.trim();
    return texto.length > 0 && texto.length <= longitudMaxima ? texto : null;
}

// SEGURIDAD [VAL-03]: importes no negativos, finitos y con hasta dos decimales.
function validarPrecio(valor: unknown): number | null {
    if (typeof valor !== 'string' && typeof valor !== 'number') return null;
    const texto = String(valor).trim();
    if (!/^\d+(?:\.\d{1,2})?$/.test(texto)) return null;
    const precio = Number(texto);
    if (!Number.isFinite(precio) || precio < 0 || precio >= 100000000 ||
        !Number.isSafeInteger(Math.round(precio * 100))) {
        return null;
    }
    return precio;
}

// SEGURIDAD [VAL-04]: solo enteros no negativos, dentro de un límite razonable.
function validarCantidad(valor: unknown): number | null {
    if ((typeof valor !== 'string' && typeof valor !== 'number') ||
        !/^(0|[1-9]\d*)$/.test(String(valor))) {
        return null;
    }
    const cantidad = Number(valor);
    return Number.isSafeInteger(cantidad) && cantidad <= 1000000000
        ? cantidad : null;
}

interface DatosProducto {
    nombre_producto: string;
    precio_venta: number;
    precio_compra: number;
    cantidad_disponible: number;
    nombre_categoria: string;
}

function validarProducto(body: unknown): DatosProducto | null {
    if (body === null || typeof body !== 'object' || Array.isArray(body)) {
        return null;
    }
    const datos = body as Record<string, unknown>;
    const nombre_producto = validarTexto(datos.nombre_producto);
    const precio_venta = validarPrecio(datos.precio_venta);
    const precio_compra = validarPrecio(datos.precio_compra);
    const cantidad_disponible = validarCantidad(datos.cantidad_disponible);
    const nombre_categoria = validarTexto(datos.nombre_categoria);

    if (nombre_producto === null || precio_venta === null ||
        precio_compra === null || cantidad_disponible === null ||
        nombre_categoria === null) {
        return null;
    }
    // SEGURIDAD [MASS-01]: lista blanca de campos; se ignoran id y campos extra.
    return {
        nombre_producto, precio_venta, precio_compra,
        cantidad_disponible, nombre_categoria
    };
}

function manejarError(res: Response, error: unknown): void {
    const codigo = error !== null && typeof error === 'object' && 'code' in error
        ? String((error as { code?: unknown }).code)
        : 'DESCONOCIDO';

    if (codigo === 'ER_DUP_ENTRY') {
        res.status(409).json({ mensaje: 'Ya existe un registro con esos datos.' });
        return;
    }
    if (codigo === 'ER_ROW_IS_REFERENCED' || codigo === 'ER_ROW_IS_REFERENCED_2') {
        res.status(409).json({ mensaje: 'No puede eliminarse: existen registros relacionados.' });
        return;
    }
    console.error('Error en inventario_tienda. Código:', codigo);
    res.status(500).json({ mensaje: 'Error interno del servidor.' });
}

class Inventario_TiendaController {

    public async agregar_producto(req: Request, res: Response): Promise<void> {
        const datos = validarProducto(req.body);
        if (datos === null) {
            res.status(400).json({ mensaje: 'Datos del producto inválidos.' });
            return;
        }
        try {
            const categorias = await pool.query(
                'SELECT id FROM categorias WHERE nombre_categoria = ? LIMIT 1',
                [datos.nombre_categoria]
            );
            if (categorias.length === 0) {
                res.status(400).json({
                    mensaje: 'La categoría no existe. Por favor, crea la categoría antes de agregar el producto.'
                });
                return;
            }
            const existentes = await pool.query(
                'SELECT id FROM inventario_tienda WHERE nombre_producto = ? LIMIT 1',
                [datos.nombre_producto]
            );
            if (existentes.length > 0) {
                res.status(409).json({ mensaje: 'El producto ya existe.' });
                return;
            }
            await pool.query(
                `INSERT INTO inventario_tienda
                 (nombre_producto, precio_venta, precio_compra, cantidad_disponible, categoria_id)
                 VALUES (?, ?, ?, ?, ?)`,
                [datos.nombre_producto, datos.precio_venta, datos.precio_compra,
                 datos.cantidad_disponible, categorias[0].id]
            );
            res.status(201).json({ mensaje: 'Producto creado exitosamente.' });
        } catch (error) {
            manejarError(res, error);
        }
    }

    public async editar_producto(req: Request, res: Response): Promise<void> {
        // SEGURIDAD [ID-01]: la URL es la fuente del ID, no req.body.id.
        const id = validarId(req.params.id);
        if (id === null) {
            res.status(400).json({ mensaje: 'Identificador de producto inválido.' });
            return;
        }
        const datos = validarProducto(req.body);
        if (datos === null) {
            res.status(400).json({ mensaje: 'Datos del producto inválidos.' });
            return;
        }
        try {
            const categorias = await pool.query(
                'SELECT id FROM categorias WHERE nombre_categoria = ? LIMIT 1',
                [datos.nombre_categoria]
            );
            if (categorias.length === 0) {
                res.status(400).json({
                    mensaje: 'La categoría no existe. Por favor, crea la categoría antes de modificar el producto.'
                });
                return;
            }
            const existentes = await pool.query(
                'SELECT id FROM inventario_tienda WHERE nombre_producto = ? AND id <> ? LIMIT 1',
                [datos.nombre_producto, id]
            );
            if (existentes.length > 0) {
                res.status(409).json({ mensaje: 'Ya existe otro producto con ese nombre.' });
                return;
            }
            const resultado = await pool.query(
                `UPDATE inventario_tienda SET
                    nombre_producto = ?,
                    precio_venta = ?,
                    precio_compra = ?,
                    cantidad_disponible = ?,
                    categoria_id = ?
                 WHERE id = ?`,
                [datos.nombre_producto, datos.precio_venta, datos.precio_compra,
                 datos.cantidad_disponible, categorias[0].id, id]
            );
            if (resultado.affectedRows === 0) {
                res.status(404).json({ mensaje: 'Producto no encontrado.' });
                return;
            }
            res.json({ mensaje: 'El producto fue actualizado correctamente.' });
        } catch (error) {
            manejarError(res, error);
        }
    }

    public async eliminar_producto(req: Request, res: Response): Promise<void> {
        const id = validarId(req.params.id);
        if (id === null) {
            res.status(400).json({ mensaje: 'Identificador de producto inválido.' });
            return;
        }
        try {
            const resultado = await pool.query(
                'DELETE FROM inventario_tienda WHERE id = ?', [id]
            );
            if (resultado.affectedRows === 0) {
                res.status(404).json({ mensaje: 'Producto no encontrado.' });
                return;
            }
            res.json({ mensaje: 'Producto eliminado correctamente.' });
        } catch (error) {
            manejarError(res, error);
        }
    }

    // SEGURIDAD [DATA-01]: catálogo público sin costo interno de compra.
    public async mostrar_productos(req: Request, res: Response): Promise<void> {
        try {
            const productos = await pool.query(
                `SELECT i.id, i.nombre_producto, i.precio_venta,
                        i.cantidad_disponible, c.nombre_categoria
                 FROM inventario_tienda AS i
                 INNER JOIN categorias AS c ON i.categoria_id = c.id`
            );
            res.json(productos);
        } catch (error) {
            manejarError(res, error);
        }
    }

    // SEGURIDAD [DATA-02]: vista de administración con precio de compra.
    // La ruta correspondiente exige JWT y rol Administrador.
    public async mostrar_productos_admin(req: Request, res: Response): Promise<void> {
        try {
            const productos = await pool.query(
                `SELECT i.id, i.nombre_producto, i.precio_venta,
                        i.precio_compra, i.cantidad_disponible, c.nombre_categoria
                 FROM inventario_tienda AS i
                 INNER JOIN categorias AS c ON i.categoria_id = c.id`
            );
            res.json(productos);
        } catch (error) {
            manejarError(res, error);
        }
    }
}

export const inventario_tiendaController = new Inventario_TiendaController();

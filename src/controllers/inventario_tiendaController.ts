import {Request,Response} from 'express';
import pool from '../database'; //acceso a la base de datos

class Inventario_TiendaController{

    public async agregar_producto(req: Request, res: Response ): Promise<void>{
        const {nombre_producto,precio_venta, precio_compra, cantidad_disponible,nombre_categoria} = req.body;
        let categoria_id=0;
        
        const categoriaExistente = await pool.query(`SELECT id FROM categorias WHERE nombre_categoria = ?`, [nombre_categoria]);

            if (categoriaExistente.length > 0){
                categoria_id = categoriaExistente[0].id;
            }else{
                res.json({ mensaje: 'La categoría no existe. Por favor, crea la categoría antes de agregar el producto.' });
                return;
                //const crearcategoria=await pool.query('INSERT INTO categorias (nombre_categoria) VALUES (?);',[nombre_categoria]);
                //categoria_id = crearcategoria[0].id;
            }

        const productosExistente=await pool.query('SELECT * FROM inventario_tienda WHERE nombre_producto = ?', [nombre_producto]);

        if (productosExistente.length>0){
            res.json({ mensaje: 'El producto ya existe.' });
        }else{
            const agregar_producto = await pool.query('INSERT INTO inventario_tienda (nombre_producto, precio_venta, precio_compra, cantidad_disponible, categoria_id) VALUES (?, ?, ?, ?, ?)', [nombre_producto, precio_venta, precio_compra, cantidad_disponible, categoria_id]);
            res.json({ mensaje: 'Producto creado exitosamente.' });
        }
    }

    public async editar_producto(req: Request, res: Response ): Promise<void>{
        const {id,nombre_producto,precio_venta, precio_compra, cantidad_disponible,nombre_categoria} = req.body;

        let categoria_id=0;
        
        const categoriaExistente = await pool.query(`SELECT id FROM categorias WHERE nombre_categoria = ?`, [nombre_categoria]);

            if (categoriaExistente.length > 0){
                categoria_id = categoriaExistente[0].id;
            }else{
                res.json({ mensaje: 'La categoría no existe. Por favor, crea la categoría antes de modificar el producto.' });
                return;
                //const crearcategoria=await pool.query('INSERT INTO categorias (nombre_categoria) VALUES (?);',[nombre_categoria]);
                //const categoria_id = crearcategoria[0].id;
            }


        const actualizar_producto = await pool.query(`
    UPDATE inventario_tienda 
    SET 
        nombre_producto = ?, 
        precio_venta = ?, 
        precio_compra = ?, 
        cantidad_disponible = ?, 
        categoria_id = ? 
    WHERE id = ?`, 
    [nombre_producto, precio_venta, precio_compra, cantidad_disponible, categoria_id, id]);

    res.json({ mensaje: 'El producto fue actualizado corectamente.' });
        
    }

    public async eliminar_producto(req: Request, res: Response): Promise<void> {
        const { id } = req.params; // Obtener el ID del parámetro de la URL
        const eliminar_producto = await pool.query('DELETE FROM inventario_tienda WHERE id = ?;', [id]);
        res.json(eliminar_producto);
    }
    
    
    

    public async mostrar_productos(req: Request, res: Response ): Promise<void>{
        const mostrar_total_productos=await pool.query('SELECT i.id, i.nombre_producto, i.precio_venta, i.precio_compra, i.cantidad_disponible, c.nombre_categoria FROM inventario_tienda i INNER JOIN categorias c ON i.categoria_id = c.id;');
        res.json( mostrar_total_productos );
    
    }


    

}

export const inventario_tiendaController = new Inventario_TiendaController();
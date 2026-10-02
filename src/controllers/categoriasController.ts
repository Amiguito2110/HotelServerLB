import { Request, Response } from 'express';
import pool from '../database'; //acceso a la base de datos

class CategoriaController {

    public async agregarCategoria(req: Request, res: Response): Promise<void> {
        const { nombre_categoria } = req.body;
        const categoriaExistente = await pool.query(`SELECT id FROM categorias WHERE nombre_categoria = ?`, [nombre_categoria]);

            if (categoriaExistente.length > 0){
                res.json(categoriaExistente);
            }else{
                const crearcategoria=await pool.query('INSERT INTO categorias (nombre_categoria) VALUES (?);',[nombre_categoria]);
                res.json(crearcategoria);
            }
    }

    public async editarCategoria(req: Request, res: Response): Promise<void> {
        const { id } = req.params;
        const { nombre_categoria } = req.body;

        const resultado = await pool.query('UPDATE categorias SET nombre_categoria = ? WHERE id = ?', [nombre_categoria, id]);

        if (resultado.affectedRows > 0) {
            res.json({ mensaje: 'Categoría actualizada correctamente.' });
        } else {
            res.status(404).json({ mensaje: 'La categoría no existe.' });
        }
    }

    public async eliminarCategoria(req: Request, res: Response): Promise<void> {
        const { id } = req.params;

        const resultado = await pool.query('DELETE FROM categorias WHERE id = ?', [id]);

    }

    public async mostrarCategorias(req: Request, res: Response): Promise<void> {
        const categorias = await pool.query('SELECT * FROM categorias');
        res.json(categorias);
    }

}

export const categoriaController = new CategoriaController();

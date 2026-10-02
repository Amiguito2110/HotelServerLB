import { Request, Response } from 'express';
import pool from '../database'; // Acceso a la base de datos

class ListaPromocionesController {

    public async mostrarPromociones(req: Request, res: Response): Promise<void> {
        try {
            const promociones = await pool.query('SELECT * FROM promociones');
            res.json(promociones);
        } catch (error) {
            console.error("Error al obtener promociones:", error);
            res.status(500).json({ error: "Error al obtener promociones" });
        }
    }

    public async eliminarPromocion(req: Request, res: Response): Promise<void> {
        const { id } = req.params;
        try {
            const respuesta = await pool.query('DELETE FROM promociones WHERE IDPromocion = ?', [id]);
            res.json(respuesta);
        } catch (error) {
            console.error("Error al eliminar promoción:", error);
            res.status(500).json({ error: "Error al eliminar promoción" });
        }
    }
}

export const listaPromocionesController = new ListaPromocionesController();

import {Request,Response} from 'express';
import pool from '../database'; //acceso a la base de datos

class HabitacionesController{

    public async mostrar_todas_habitaciones(req: Request, res: Response ): Promise<void>{
        const respuesta = await pool.query('SELECT * FROM habitaciones');
        res.json( respuesta );
    }

    public async eliminar_datos_foto(req: Request, res: Response): Promise<void> {
        const { id } = req.params;
        const resp = await pool.query(`DELETE FROM fotos_habitaciones WHERE id_foto = ${id}`);
        res.json(resp);
    }

    public async inserta_datos_foto(req: Request, res: Response ): Promise<void>{
        const id = req.body.id;
        const respuesta = await pool.query('INSERT INTO fotos_habitaciones (id_habitacion) VALUES (?)',[id]);
        res.json( respuesta );
    }

    public async id_fotos_por_habitacion(req: Request, res: Response ): Promise<void>{
        const { id } = req.params;
        const respuesta = await pool.query('SELECT * FROM fotos_habitaciones WHERE id_habitacion = ?', [id]);
        res.json( respuesta );
    }
    public async fotoPrincipal_by_Idhabitacion(req: Request, res: Response ): Promise<void> {
        const { id } = req.params;
        try {
            const respuesta = await pool.query('SELECT id_foto FROM fotos_habitaciones WHERE id_habitacion = ? ORDER BY id_foto LIMIT 1', [id]);
            if (respuesta && respuesta.length > 0) {
                const idFoto = respuesta[0].id_foto;
                res.json({ id_foto: idFoto });
            } else {
                res.status(404).json({ mensaje: 'No se encontró ninguna foto para la habitación especificada.' });
            }
        } catch (error) {
            console.error('Error al obtener la foto principal:', error);
            res.status(500).json({ mensaje: 'Error interno del servidor al obtener la foto principal.' });
        }
    }

    public async mostrar_habitacion(req: Request, res: Response): Promise <void>{
        const {id} = req.params;
        const respuesta = await pool.query('SELECT * FROM habitaciones WHERE IDHabitacion = ?', [id]);
        if(respuesta.length > 0){
            res.json(respuesta[0]);
            return ;
        }
        res.status(404).json({'Mensaje': 'Habitacion no encontrada.'});
    }

    public async crear_habitacion(req: Request, res: Response): Promise<void> {
        const resp = await pool.query("INSERT INTO habitaciones SET ?", [req.body]);
    
        //constantes para almacenar los ids y total de habitaciones de la creacion de la habitacion
        const insertId = resp.insertId;
        const totalTipoHabitacion = req.body.TotalTipoHabitacion;
    
        // Consulta para insertar en la tabla de disponibilidadporfecha
        const queryDisponibilidad = `
            INSERT INTO disponibilidadporfecha (IDTipoHabitacion, Fecha, TotalHabitacionesDisponibles)
            SELECT 
                ${insertId} AS IDTipoHabitacion, 
                fecha, 
                ${totalTipoHabitacion} AS TotalHabitacionesDisponibles
            FROM (
                -- Generar fechas desde '2024-01-01' hasta '2024-12-31 ya que ese rango se maneja por el momento'
                SELECT DATE_ADD('2024-01-01', INTERVAL n DAY) AS fecha
                FROM (
                    -- Tabla de números (puedes crearla si no tienes una)
                    SELECT a.N + b.N * 10 + c.N * 100 AS n
                    FROM 
                        (SELECT 0 AS N UNION ALL SELECT 1 UNION ALL SELECT 2 UNION ALL SELECT 3 UNION ALL SELECT 4 UNION ALL SELECT 5 UNION ALL SELECT 6 UNION ALL SELECT 7 UNION ALL SELECT 8 UNION ALL SELECT 9) AS a
                        CROSS JOIN 
                        (SELECT 0 AS N UNION ALL SELECT 1 UNION ALL SELECT 2 UNION ALL SELECT 3 UNION ALL SELECT 4 UNION ALL SELECT 5 UNION ALL SELECT 6 UNION ALL SELECT 7 UNION ALL SELECT 8 UNION ALL SELECT 9) AS b
                        CROSS JOIN 
                        (SELECT 0 AS N UNION ALL SELECT 1 UNION ALL SELECT 2 UNION ALL SELECT 3 UNION ALL SELECT 4 UNION ALL SELECT 5 UNION ALL SELECT 6 UNION ALL SELECT 7 UNION ALL SELECT 8 UNION ALL SELECT 9) AS c
                ) AS numbers
                WHERE DATE_ADD('2024-01-01', INTERVAL n DAY) <= '2024-12-31'
            ) AS fechas;
        `;
        
        // Ejecutar la consulta de disponibilidad
        await pool.query(queryDisponibilidad);
        res.json(resp);
    }
    

    public async actualizar_habitacion(req: Request, res: Response): Promise<void> {
        const { id } = req.params;
        console.log(id);
        const resp = await pool.query("UPDATE habitaciones set ? WHERE IDHabitacion = ?", [req.body, id]);
        res.json(resp);
    }

    public async eliminar_habitacion(req: Request, res: Response): Promise<void> {
        const { id } = req.params;
        const resp = await pool.query(`DELETE FROM habitaciones WHERE IDHabitacion = ${id}`);
        res.json(resp);
    }

    public async total_habitaciones(req: Request, res: Response): Promise <void>{
        const respuesta = await pool.query('SELECT SUM(TotalTipoHabitacion) AS TotalHabitaciones FROM habitaciones');
        if(respuesta.length > 0){
            res.json(respuesta[0]);
            return ;
        }
        res.status(404).json({'Mensaje': 'Habitacion no encontrada.'});
    }

}

export const habitacionesController = new HabitacionesController();
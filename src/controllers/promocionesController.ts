import { Request, Response } from 'express';
import pool from '../database'; // Acceso a la base de datos

class PromocionesController {
    // Mostrar todas las promociones
    public async mostrarTodasPromociones(req: Request, res: Response): Promise<void> {
        try {
            console.log("probandoo");
            
            const promociones = await pool.query('SELECT * FROM promociones');
            res.json(promociones);
        } catch (error:any) {
            console.error(error.message);
            res.status(500).send('Error del servidor');
        }
    }

    // Agregar una nueva promoción
    public async agregarPromociones(req: Request, res: Response): Promise<void> {
        //console.log(req.body);
        //console.log(req.body.habitacionesSeleccionadas);
        try {
            // Recibe los datos de la promoción desde el cuerpo de la solicitud
            const promociones = req.body.habitacionesSeleccionadas; // Arreglo de promociones
            console.log(promociones);
            const fechaIn = req.body.fechin;
            const fechout = req.body.fechout;
            const porcentaje = (req.body.porcentaje);

            //console.log(fechaIn,fechout);
            // Itera sobre cada objeto de promoción en el arreglo
            for (const promocion of promociones) {
                const { IDHabitacion, TipoHabitacion, Costo } = promocion;
                const costoDesc = Costo - (Costo*(porcentaje/100));
                console.log(porcentaje, costoDesc);
                //const fechaInicio = new Date(fechin);
                //const fechaFin = new Date(fechout);
                //console.log(fechaInicio,fechaFin);
                // Inserta la promoción en la base de datos
                await pool.query('INSERT INTO promociones (IDHabitacion, TipoHabitacion, Costo, descuento, costoDesc, fechin, fechout) VALUES (?, ?, ?, ?, ?, ?, ?)', [IDHabitacion, TipoHabitacion, Costo, porcentaje, costoDesc, fechaIn, fechout]);
            }
    
            res.json({ msg: 'Promociones agregadas correctamente' });
        } catch (error:any) {
            console.error(error.message);
            res.status(500).send('Error del servidor');
        }
    }
    



    public async eliminarPromocion(req: Request, res: Response): Promise<void> {
        const {id} = req.params;
    console.log(id);
    console.log("eliminando");
    
    
        const resp = await pool.query(`DELETE FROM promociones WHERE IDPromocion = ${id}`);
        res.json(resp);
    }
    
    

}    

export const promocionesController = new PromocionesController();
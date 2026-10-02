import { Request, Response } from 'express';
import pool from '../database';

export class CarritoController {
    reservasCarrito: any;
    detalleCarrito: any;
    rango: any;


    public async filtrar_carrito(req: Request, res: Response): Promise<void> {
        let flag = 0;
        const { id } = req.params;
        console.log("aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa");

        console.log("filtrar carrito:", id);
        const respuesta = await pool.query(`SELECT DATE_FORMAT(FechaEntrada, \'%Y-%m-%d\') AS FechaEntrada, DATE_FORMAT(FechaSalida, \'%Y-%m-%d\') AS FechaSalida, IDCarrito, IDCuenta, CostoTotal FROM carritoreservaciones WHERE IDCuenta = '${id}'`);
        console.log("respuesta", respuesta);

        respuesta.forEach(async (reserva: any) => {
            // console.log("en for each: ", reserva.IDCarrito);
            const resDetalleCarrito = await pool.query(`SELECT IDHabitacion, CantidadHabitaciones FROM detallecarrito WHERE IDCarrito = '${reserva.IDCarrito}'`);
            console.log(resDetalleCarrito);

            console.log(reserva.FechaEntrada, reserva.FechaSalida);
            
            var consulta = `WITH HabitacionesDisponibles AS (
                SELECT 
                    h.IDHabitacion, 
                    h.TipoHabitacion, 
                    h.MaxHuespedes, 
                    h.TotalTipoHabitacion, 
                    h.Costo,
                    d.Fecha,
                    d.TotalHabitacionesDisponibles
                FROM 
                    habitaciones h
                JOIN 
                    disponibilidadporfecha d ON h.IDHabitacion = d.IDTipoHabitacion
                WHERE 
                    d.Fecha BETWEEN '${reserva.FechaEntrada}' AND '${reserva.FechaSalida}'
                    AND d.TotalHabitacionesDisponibles > 0
            ),
            HabitacionesConDisponibilidadCero AS (
                SELECT 
                    h.IDHabitacion
                FROM 
                    HabitacionesDisponibles h
                WHERE 
                    NOT EXISTS (
                        SELECT 
                            1
                        FROM 
                            disponibilidadporfecha d
                        WHERE 
                            d.IDTipoHabitacion = h.IDHabitacion
                            AND d.Fecha BETWEEN '${reserva.FechaEntrada}' AND '${reserva.FechaSalida}'
                            AND d.TotalHabitacionesDisponibles > 0
                    )
            )
            SELECT 
                IDHabitacion,
                TipoHabitacion,
                MaxHuespedes,
                TotalTipoHabitacion,
                Costo,
                MinDisponibles
            FROM 
                (
                    SELECT 
                        h.IDHabitacion, 
                        h.TipoHabitacion, 
                        h.MaxHuespedes, 
                        h.TotalTipoHabitacion, 
                        h.Costo,
                        0 AS MinDisponibles
                    FROM 
                        HabitacionesDisponibles h
                    WHERE 
                        h.IDHabitacion NOT IN (SELECT IDHabitacion FROM HabitacionesConDisponibilidadCero)
                    UNION
                    SELECT 
                        h.IDHabitacion, 
                        h.TipoHabitacion, 
                        h.MaxHuespedes, 
                        h.TotalTipoHabitacion, 
                        h.Costo,
                        MIN(d.TotalHabitacionesDisponibles) AS MinDisponibles
                    FROM 
                        HabitacionesDisponibles h
                    JOIN 
                        disponibilidadporfecha d ON h.IDHabitacion = d.IDTipoHabitacion
                    WHERE 
                        d.Fecha BETWEEN  '${reserva.FechaEntrada}' AND '${reserva.FechaSalida}'
                    GROUP BY 
                        h.IDHabitacion, 
                        h.TipoHabitacion, 
                        h.MaxHuespedes, 
                        h.TotalTipoHabitacion, 
                        h.Costo
                    HAVING 
                        MIN(d.TotalHabitacionesDisponibles) > 0
                ) AS Resultado
            WHERE 
                MinDisponibles > 0
            ORDER BY 
                IDHabitacion;`
            const resDisponibilidad = await pool.query(consulta);
            console.log("disponibilidad",resDisponibilidad);
            resDetalleCarrito.forEach(async (detalle: any) => {
                console.log("recorriendo detalles: ",detalle);
                resDisponibilidad.forEach(async(check: any) => {
                    console.log("recorriendo disponibilidad: ",check);
                    console.log(detalle.IDHabitacion == check.IDHabitacion);
                    if(detalle.IDHabitacion == check.IDHabitacion){
                        flag = 1;
                        console.log("ENTRANDO AL IF");  
                        console.log(check.MinDisponibles < detalle.CantidadHabitaciones);
                         
                        if(check.MinDisponibles < detalle.CantidadHabitaciones){
                            console.log("Marcando como no disponible");
                            const resUpdate = await pool.query(`UPDATE carritoreservaciones SET disponible = 0 WHERE IDCarrito = '${reserva.IDCarrito}'`);
                            // const resp = await pool.query(`DELETE FROM carritoreservaciones WHERE IDCarrito = ?;`, [reserva.IDCarrito]);
                            // const resp2 = await pool.query(`DELETE FROM detallecarrito WHERE IDCarrito = ?;`, [reserva.IDCarrito]);
                        }
                    }
                });
            });
        });
        
        res.json(respuesta)
    }

    public async agregar_carrito(req: Request, res: Response): Promise<void> {
        try {
            const datos_carrito = req.body;
            console.log('datos_carrito', datos_carrito);

            const insert_carrito = `INSERT INTO carritoreservaciones (IDCuenta, FechaEntrada, FechaSalida, CostoTotal) VALUES (?, ?, ?, ?)`;
            const reservaValues = [datos_carrito.IDCuenta, datos_carrito.FechaEntrada, datos_carrito.FechaSalida, datos_carrito.CostoTotal];
            const consulta = await pool.query(insert_carrito, reservaValues);
            const IDCarrito = consulta.insertId;

            for (const detalle of datos_carrito.DetalleCarrito) {
                const insert_detallesCarrito = `INSERT INTO detallecarrito(IDCarrito, IDHabitacion, CantidadHabitaciones) 
                    VALUES ('${IDCarrito}','${detalle.IDHabitacion}','${detalle.CantidadHabitaciones}')`;
                await pool.query(insert_detallesCarrito)
            }

            res.json({
                IDCarrito,
                // reserva: consulta,
            });

        } catch (error) {
            console.error(error);
            res.status(500).json({ mensaje: 'Error interno del servidor' });
        }
    }

    public async mostrar_carrito(req: Request, res: Response): Promise<void> {
        const { id } = req.params;
        const respuesta = await pool.query(`SELECT DATE_FORMAT(FechaEntrada, \'%Y-%m-%d\') AS FechaEntrada, DATE_FORMAT(FechaSalida, \'%Y-%m-%d\') AS FechaSalida, IDCarrito, IDCuenta, CostoTotal FROM carritoreservaciones WHERE IDCuenta = '${id}' AND disponible = 1`);
        res.json(respuesta);
    }

    public async mostrar_carrito_no_disponibles(req: Request, res: Response): Promise<void> {
        const { id } = req.params;
        const respuesta = await pool.query(`SELECT DATE_FORMAT(FechaEntrada, \'%Y-%m-%d\') AS FechaEntrada, DATE_FORMAT(FechaSalida, \'%Y-%m-%d\') AS FechaSalida, IDCarrito, IDCuenta, CostoTotal FROM carritoreservaciones WHERE IDCuenta = '${id}' AND disponible = 0`);
        res.json(respuesta);
    }

    public async mostrar_detalle_carrito(req: Request, res: Response): Promise<void> {
        const { id } = req.params;
        const respuesta = await pool.query(`SELECT IDHabitacion, CantidadHabitaciones FROM detallecarrito WHERE IDCarrito = '${id}'`);
        res.json(respuesta);
    }

    public async actualizar_carrito(req: Request, res: Response): Promise<void> {
        const { id } = req.params;
        console.log(id);
        const resp = await pool.query("UPDATE carritoceservaciones set ? WHERE IDCarrito = ?", [req.body, id]);
        res.json(resp);
        console.log(resp);
    }

    public async eliminar_carrito(req: Request, res: Response): Promise<void> {
        const { id } = req.params;
        const resp = await pool.query(`DELETE FROM carritoreservaciones WHERE IDCarrito = ?;`, [id]);
        const resp2 = await pool.query(`DELETE FROM detallecarrito WHERE IDCarrito = ?;`, [id]);
        res.json(resp);
    }
}

export const carritoController = new CarritoController();

function async(arg0: any) {
    throw new Error('Function not implemented.');
}

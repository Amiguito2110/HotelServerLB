import { Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import pool from '../database'; //acceso a la base de datos

class CuentaController {

    public async set_foto_cero(req: Request, res: Response): Promise<void> {
        const { id } = req.params;
        console.log("que pasa aquiiiiiiiiiiiiiiiiiiiiiiiiiiiiiii");
        console.log(req.body.Foto);
        
        const resp = await pool.query(`UPDATE cuenta set Foto = ? WHERE IDCuenta = ${id}`,[req.body.Foto]);
        res.json(resp);
    }

    public async mostrar_todas_cuentas(req: Request, res: Response): Promise<void> {
        const respuesta = await pool.query('SELECT * FROM cuenta WHERE Rol = 2');
        res.json(respuesta);
    }

    public async mostrar_correos_usuarios(req: Request, res: Response): Promise<void> {
        const respuesta = await pool.query('SELECT CorreoElectronico FROM cuenta WHERE Rol = 3');
        res.json(respuesta);
    }

    public async mostrar_cuenta(req: Request, res: Response): Promise<void> {
        const { id } = req.params;
        const respuesta = await pool.query('SELECT * FROM cuenta WHERE IDCuenta = ?', [id]);
        console.log(respuesta)
        if (respuesta.length > 0) {
            res.json(respuesta[0]);
            return;
        }
        res.status(404).json({ 'Mensaje': 'Cuenta no encontrada.' });
    }

    public async correo_existe(req: Request, res: Response): Promise<void> {
        const parametros = req.body;
        var consulta = `SELECT CorreoElectronico FROM cuenta WHERE CorreoElectronico = '${parametros.CorreoElectronico}'`;
        console.log(consulta);
        const resp = await pool.query(consulta);
        console.log(resp);
        if (resp.length > 0) {
            res.json(resp);
            console.log("Correo encontrado")
        }else{
            res.json({"CorreoElectronico":"-1"});
        }
  
    }

    public async correo_existe2(req: Request, res: Response): Promise<void> {
        const { correo2 } = req.params;
        const respuesta = await pool.query('SELECT CorreoElectronico FROM cuenta WHERE CorreoElectronico = ?', [correo2]);
        if (respuesta.length > 0) {
            res.json({ "isCorreoElectronico": "1" });
        } else {
            res.json({ "isCorreoElectronico": "0" });
        }
    }

    public async crear_cuenta(req: Request, res: Response): Promise<void> {
        const salt = await bcrypt.genSalt(10);
        console.log(salt);

        req.body.Contrasena = await bcrypt.hash(req.body.Contrasena, salt);
        console.log(req.body.Contrasena);

        console.log(req.body)
        const resp = await pool.query("INSERT INTO cuenta set ?", [req.body]);
        res.json(resp);
        // res.json(null);
    }

    public async actualizar_cuenta(req: Request, res: Response): Promise<void> {
        const { id } = req.params;
        console.log(id);

        const salt = await bcrypt.genSalt(10);
        console.log(salt);

        req.body.Contrasena = await bcrypt.hash(req.body.Contrasena, salt);
        console.log(req.body.Contrasena);

        const resp = await pool.query("UPDATE cuenta set ? WHERE IDCuenta = ?", [req.body, id]);
        res.json(resp);
        console.log(resp);
    }

    public async eliminar_cuenta(req: Request, res: Response): Promise<void> {
        const { id } = req.params;
        const resp = await pool.query(`DELETE FROM cuenta WHERE IDCuenta = ?`, [id]);
        res.json(resp);
    }

    public async validar_cuenta(req: Request, res: Response): Promise<void> {
        try {
            const parametros = req.body;
            var consulta = `SELECT * FROM cuenta WHERE CorreoElectronico = '${parametros.CorreoElectronico}'`;
            const resp = await pool.query(consulta);
    
            if (resp.length > 0) {
                bcrypt.compare(parametros.Contrasena, resp[0].Contrasena, (err, resEncriptar) => {
                    if (resEncriptar) {
                        res.json(resp[0]); // Contraseña correcta, devuelve la información de la cuenta
                    } else {
                        res.status(401).json({ error: "Contraseña incorrecta" }); // Contraseña incorrecta
                    }
                });
            } else {
                res.status(404).json({ error: "Correo electrónico no encontrado" }); // Correo electrónico no encontrado
            }
        } catch (error) {
            console.error("Error en la consulta:", error);
            res.status(500).json({ error: "Error en la consulta de la base de datos" }); // Error en la consulta
        }
    }

    public async actualizarFoto(req: Request, res: Response): Promise<void> {
        const { id } = req.params;
        //console.log(req.params);
        console.log(req.body);
        const resp = await pool.query("UPDATE cuenta set Foto = ? WHERE IDCuenta = ?", [req.body.Foto, id]);
        res.json(resp);
        //res.json(null);
    }
    
}

export const cuentaController = new CuentaController();
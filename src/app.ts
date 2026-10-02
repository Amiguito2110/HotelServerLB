import express, { Application } from 'express';
import morgan from 'morgan';
import cors from 'cors';
import jwt from 'jsonwebtoken';
import dotenv from 'dotenv';
import pool from "./database";
import bcrypt from 'bcryptjs';
const correoAcceso = require('./correoAcceso');
const accesoPromociones = require('./accesoPromociones');

class Server {
    public app: Application;
    constructor() {
        dotenv.config();
        this.app = express();
        this.config();
        this.routes();
    }
    config(): void {
        this.app.use(express.urlencoded({ limit: '50mb', parameterLimit: 100000, extended: false }));
        this.app.use(express.json({ limit: '50mb' }));
        this.app.set('port', process.env.PORT_ALT || 3001);
        this.app.use(morgan('dev'));
        this.app.use(cors());
        this.app.use(express.urlencoded({ extended: false }));
    }
    routes(): void {
        this.app.post('/enviarCorreoRecuperarContrasenya', (req, res) => {
            correoAcceso(req.body);
            res.json(true);
        });

        this.app.post('/enviarPromociones', (req, res) => {
            accesoPromociones(req.body);
            res.json(true);
        });

        this.app.post('/decodificarMail', async (req, res) => {
            console.log(req.body)
            let decodificado;
            try {
                decodificado = jwt.verify(req.body.token, process.env.TOKEN_SECRET || 'prueba');
                const result1 = await this.queryUsuario(decodificado) as any;
                if (result1.length == 0) {
                    res.json(0);
                    console.log("No funciono la consulta 1");
                } else {
                    console.log(result1);
                    const idCuenta = result1[0].IDCuenta;
                    const salt = bcrypt.genSaltSync(10);
                    const hash = bcrypt.hashSync(req.body.Contrasena, salt);
                    
                    const result2 = await this.queryCambiaC(hash,idCuenta) as any;
                    if (result2.length == 0) {
                        console.log("No funciono la consulta 2");
                        console.log( result2 );
                        res.json(0);
                        
                    } else {
                        console.log("Cambio de Contraseña exitoso")
                        console.log( result2 );
                        res.json( result2 );
                    }
                }

            }
            catch (err) { res.json(0); }
        });
    }
    queryUsuario = (decodificado: any) => {
        return new Promise((resolve, reject) => {
            let consulta = 'SELECT * FROM cuenta WHERE CorreoElectronico="' + decodificado + '"';
            pool.query(consulta, (error: any, results: any) => {
                if (error)
                    return reject(error);
                return resolve(results);
            });
        });
    };
    queryCambiaC = (hash: any, id: any) => {
        return new Promise((resolve, reject) => {
            let consulta = `UPDATE cuenta SET Contrasena = '`+ hash +`' WHERE cuenta.IDCuenta = `+id;
            pool.query(consulta, (error: any, results: any) => {
                if (error)
                    return reject(error);
                return resolve(results);
            });
        });
    };

    start() {
        this.app.listen(this.app.get('port'), () => {
            console.log(`Servicio de Correos corriendo en el Puerto:  ${this.app.get('port')}`);
        });
    }
}
const server = new Server();
server.start();

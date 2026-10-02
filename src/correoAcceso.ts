var email = require("emailjs/email");
import jwt from 'jsonwebtoken';
//console.log("hola");
module.exports = (formulario: any) => {
    console.log(formulario);

    var token = jwt.sign(formulario.CorreoElectronico, process.env.TOKEN_SECRET || 'tokentest');
    console.log(token);
    var server = email.server.connect(
        {
            user: "campestredl@outlook.com",
            password: "142536campestre",
            port: 587,
            host: "smtp-mail.outlook.com",
            tls: true,
        });

    var message: any = {};
    message = {
        from: "campestredl@outlook.com",
        to: "<" + formulario.CorreoElectronico + ">",
        //to: ["Wilmer<miskamuska2011@gmail.com>", "EscuelaW<hehw010118@gs.utm.mx>" ],
        bcc: "",
        subject: "Hotel Campestre (Cambio de Contraseña)",
        attachment: [
            { data: `<a href="http://3.20.116.48:8080/restablecer/${token}" style="font-family: verdana, arial, sans-serif;font-size: 10pt;font-weight: bold;" >Cambiar contraseña</a>`, alternative: true }
            // { data: `<a href="http://hotelcampestre.s3-website.us-east-2.amazonaws.com/restablecer/${token}" style="font-family: verdana, arial, sans-serif;font-size: 10pt;font-weight: bold;" >Cambiar contraseña</a>`, alternative: true }
        ]
    };
    server.send(message, function (err:any, message:any) { 
    if (err) {
        console.error("Error al enviar el correo electrónico:", err);
    } else {
        console.log("Correo electrónico enviado con éxito:", message);
        
    }
});

};
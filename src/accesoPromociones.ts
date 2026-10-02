var email = require("emailjs/email");
import jwt from 'jsonwebtoken';
//console.log("hola");
module.exports = (formulario: any) => {
    console.log(formulario);
    const mensaje = formulario.mensaje;
    const correos = formulario.correos;

    const correosDestinatarios = correos.join(', ');

    
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
        to: correosDestinatarios,
        bcc: "",
        subject: "Hotel Campestre (¡¡¡Promocion!!!)",
        attachment: [
            { data: `Las ofertas son: <p>${mensaje}</p>`, alternative: true }
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
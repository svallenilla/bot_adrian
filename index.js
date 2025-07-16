// index.js
require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const bodyParser = require('body-parser');
const twilio = require('twilio');
const fs = require('fs');
const { Parser } = require('json2csv');

const app = express();
app.use(bodyParser.urlencoded({ extended: false }));
app.use(bodyParser.json());

const client = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);

// MongoDB connection
mongoose.connect(process.env.MONGODB_URI, { useNewUrlParser: true, useUnifiedTopology: true })
  .then(() => console.log('✅ Conectado a MongoDB'))
  .catch(err => console.error('❌ Error de conexión:', err));

// Esquemas y Modelos
const userSchema = new mongoose.Schema({
  phone: String,
  nombre: String,
  cedula: String,
  plan: String,
  consumos: { type: Number, default: 0 },
  consultaGratis: { type: Boolean, default: false },
  afiliadoDesde: { type: Date, default: Date.now },
});

const consumoSchema = new mongoose.Schema({
  phone: String,
  fecha: { type: Date, default: Date.now },
  descripcion: String,
  atendidoPor: String,
});

const clinicaSchema = new mongoose.Schema({ nombre: String });

const User = mongoose.model('User', userSchema);
const Consumo = mongoose.model('Consumo', consumoSchema);
const Clinica = mongoose.model('Clinica', clinicaSchema);

const estadosAfiliacion = {};
const respuestasUsuario = {};

const menuPrincipal = `🤖 *Hola, soy Adrian* – Bot de Veidt Health.
Escribe el número de la opción que deseas:

1️⃣ Afiliarme
2️⃣ Consultar mi estado
3️⃣ Ver clínicas afiliadas
4️⃣ Preguntas frecuentes
5️⃣ Hablar con un asesor
6️⃣ Registrar consumo
7️⃣ Usar consulta gratuita
8️⃣ Ver historial de consumos
9️⃣ Descargar reporte`;

const faqs = {
  "1": "No somos un seguro. Ofrecemos membresías médicas con descuentos y consultas.",
  "2": "Sí, puedes usarla en cualquier ciudad con clínicas afiliadas.",
  "3": "Pagas por transferencia o con link de pago al momento de afiliarte."
};

app.post('/webhook', async (req, res) => {
  const from = req.body.From;
  const body = req.body.Body.trim();
  const numero = from.replace('whatsapp:', '');

  const user = await User.findOne({ phone: numero });

  if (estadosAfiliacion[numero]) {
    const paso = estadosAfiliacion[numero];

    if (paso === 'nombre') {
      respuestasUsuario[numero] = { nombre: body };
      estadosAfiliacion[numero] = 'cedula';
      return enviarMensaje(from, '📄 Escribe tu cédula:');
    }
    if (paso === 'cedula') {
      respuestasUsuario[numero].cedula = body;
      estadosAfiliacion[numero] = 'plan';
      return enviarMensaje(from, '💳 Elige tu plan:\n1. Membresía 1\n2. Membresía 2\n3. Membresía 3');
    }
    if (paso === 'plan') {
      const planes = { "1": "Membresía 1", "2": "Membresía 2", "3": "Membresía 3" };
      const plan = planes[body];
      if (!plan) return enviarMensaje(from, '❌ Plan inválido. Escribe 1, 2 o 3.');

      const nuevoUsuario = new User({
        phone: numero,
        nombre: respuestasUsuario[numero].nombre,
        cedula: respuestasUsuario[numero].cedula,
        plan
      });
      await nuevoUsuario.save();
      delete estadosAfiliacion[numero];
      delete respuestasUsuario[numero];
      return enviarMensaje(from, `✅ Te afiliamos al plan *${plan}*. ¡Bienvenido!`);
    }
  }

  if (body.toLowerCase().startsWith('registrar consumo')) {
    const partes = body.split(' ');
    if (partes.length < 3) return enviarMensaje(from, '⚠️ Usa el formato: Registrar consumo 04141234567 Consulta general');

    const phoneIngresado = partes[2];
    const descripcion = partes.slice(3).join(' ');
    const paciente = await User.findOne({ phone: phoneIngresado });
    if (!paciente) return enviarMensaje(from, '❌ No se encontró un usuario con ese número.');

    await new Consumo({ phone: phoneIngresado, descripcion }).save();

    paciente.consumos += 1;
    if (paciente.consumos >= 4) {
      paciente.consultaGratis = true;
      paciente.consumos = 0;
      await enviarMensaje(`whatsapp:${phoneIngresado}`, '🎉 ¡Has acumulado 4 consumos! Ahora tienes una consulta médica gratuita activa.');
    }
    await paciente.save();

    return enviarMensaje(from, `✅ Consumo registrado para ${paciente.nombre}.`);
  }

  if (body.toLowerCase() === '8') {
    if (!user) return enviarMensaje(from, '❌ No estás afiliado. Escribe 1 para registrarte.');
    const consumos = await Consumo.find({ phone: numero }).sort({ fecha: -1 });
    if (consumos.length === 0) return enviarMensaje(from, '📭 No tienes consumos registrados.');

    const resumen = consumos.map(c => `• ${c.fecha.toLocaleDateString()}: ${c.descripcion}${c.atendidoPor ? ` (Clínica: ${c.atendidoPor})` : ''}`).join('\n');
    return enviarMensaje(from, `📜 Historial de consumos:\n${resumen}`);
  }

  if (body.toLowerCase() === '9') {
    const pacientes = await User.find();
    const parser = new Parser();
    const csv = parser.parse(pacientes);
    fs.writeFileSync('reporte_pacientes.csv', csv);
    return enviarMensaje(from, '📄 El reporte ha sido generado y guardado localmente como reporte_pacientes.csv');
  }

  if (body.toLowerCase().startsWith('agregar clínica')) {
    const nombre = body.split(' ').slice(2).join(' ');
    if (!nombre) return enviarMensaje(from, '⚠️ Escribe: Agregar clínica <nombre>');
    await new Clinica({ nombre }).save();
    return enviarMensaje(from, `✅ Clínica *${nombre}* añadida a la lista.`);
  }

  if (body === '3') {
    const clinicas = await Clinica.find();
    if (clinicas.length === 0) return enviarMensaje(from, '📭 No hay clínicas registradas aún.');
    const listado = clinicas.map(c => `• ${c.nombre}`).join('\n');
    return enviarMensaje(from, `🏥 Clínicas afiliadas:\n${listado}`);
  }

  res.sendStatus(200);
});

async function enviarMensaje(to, body) {
  try {
    await client.messages.create({ from: 'whatsapp:' + process.env.WHATSAPP_NUMBER, to, body });
  } catch (err) {
    console.error('❌ Error al enviar mensaje:', err.message);
  }
}

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`🚀 Adrian está funcionando en puerto ${PORT}`));

require('dotenv').config();
const express = require('express');
const path = require('path');
const pool = require('./db');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());

// Serve os arquivos estáticos (html, css, js do front)
app.use(express.static(path.join(__dirname, 'public')));

// ===================== LOGIN =====================
app.post('/api/login', (req, res) => {
  const { password } = req.body;

  if (!password) {
    return res.status(400).json({ ok: false, error: 'Senha não informada.' });
  }

  if (password === process.env.ADMIN_PASS) {
    return res.json({ ok: true });
  }

  return res.status(401).json({ ok: false, error: 'Senha incorreta.' });
});

// ===================== PACIENTES =====================

app.get('/api/patients', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM patients ORDER BY id DESC');
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro ao buscar pacientes.' });
  }
});

app.post('/api/patients', async (req, res) => {
  const { nome, email, tel, modal, status, data, hora, msg, calId } = req.body;

  if (!nome || !email || !tel || !modal || !data || !hora) {
    return res.status(400).json({ error: 'Campos obrigatórios faltando.' });
  }

  try {
    const result = await pool.query(
      `INSERT INTO patients (nome, email, tel, modal, status, data, hora, msg, cal_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
      [nome, email, tel, modal, status || 'pendente', data, hora, msg || '', calId || null]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro ao criar paciente.' });
  }
});

app.patch('/api/patients/:id', async (req, res) => {
  const { id } = req.params;
  const { status, calId } = req.body;

  try {
    const result = await pool.query(
      `UPDATE patients SET status = COALESCE($1, status), cal_id = $2 WHERE id = $3 RETURNING *`,
      [status, calId, id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Paciente não encontrado.' });
    }
    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro ao atualizar paciente.' });
  }
});

app.delete('/api/patients/:id', async (req, res) => {
  const { id } = req.params;
  try {
    await pool.query('DELETE FROM patients WHERE id = $1', [id]);
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro ao deletar paciente.' });
  }
});

// ===================== ROTA PRINCIPAL =====================
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public/html/agendador_luciane_google_calendar.html'));
});

app.listen(PORT, () => {
  console.log(`Servidor rodando em http://localhost:${PORT}`);
});
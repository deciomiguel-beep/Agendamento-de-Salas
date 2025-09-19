import express from 'express';
import mysql from 'mysql2/promise';
import cors from 'cors';
import bcrypt from 'bcrypt';

const app = express();
app.use(cors());
app.use(express.json());

// CONFIGURAÇÕES DO BANCO
const DB_HOST = 'localhost';
const DB_USER = 'root';
const DB_PASSWORD = '';
const DB_NAME = 'eegr_agendamento';
const PORT = 3000; // Porta do servidor Express (não use 3306)

// Cria um pool de conexões
const pool = mysql.createPool({
  host: DB_HOST,
  user: DB_USER,
  password: DB_PASSWORD,
  database: DB_NAME,
  waitForConnections: true,
  connectionLimit: 10
});

(async () => {
  try {
    const conn = await pool.getConnection();
    console.log('✅ Conectado ao MySQL!');
    conn.release();
  } catch (err) {
    console.error('❌ Erro ao conectar no MySQL:', err);
    process.exit(1);
  }

  // ROTAS -------------------------------------------------------------------

  app.get('/teste', (req, res) => {
    res.json({ status: 'Servidor rodando e conectado ao banco!' });
  });

  // Cadastro de professor
  app.post('/api/cadastrar', async (req, res) => {
    try {
      const { nome, senha } = req.body;
      if (!nome || !senha) return res.json({ sucesso: false, mensagem: 'Nome e senha são necessários' });

      const [exists] = await pool.query('SELECT id FROM professores WHERE nome = ?', [nome]);
      if (exists.length > 0) return res.json({ sucesso: false, mensagem: 'Nome já cadastrado!' });

      const hash = await bcrypt.hash(senha, 10);
      const [result] = await pool.query('INSERT INTO professores (nome, senha) VALUES (?, ?)', [nome, hash]);
      res.json({ sucesso: true, id: result.insertId });
    } catch (err) {
      console.error(err);
      res.json({ sucesso: false, mensagem: 'Erro no servidor' });
    }
  });

  // Login por ID
  app.post('/api/login', async (req, res) => {
    try {
      const { id, senha } = req.body;
      if (!id || !senha) return res.json({ sucesso: false, mensagem: 'ID e senha são necessários' });

      const [rows] = await pool.query('SELECT id, nome, senha FROM professores WHERE id = ?', [id]);
      if (rows.length === 0) return res.json({ sucesso: false, mensagem: 'Usuário não encontrado' });

      const prof = rows[0];
      const ok = await bcrypt.compare(senha, prof.senha);
      if (!ok) return res.json({ sucesso: false, mensagem: 'Senha incorreta' });

      res.json({ sucesso: true, professor: { id: prof.id, nome: prof.nome } });
    } catch (err) {
      console.error(err);
      res.json({ sucesso: false, mensagem: 'Erro no servidor' });
    }
  });

  // Lista professores
  app.get('/api/professores', async (req, res) => {
    try {
      const [rows] = await pool.query('SELECT id, nome FROM professores');
      res.json({ sucesso: true, professores: rows });
    } catch (err) {
      console.error(err);
      res.json({ sucesso: false, professores: [] });
    }
  });

  // Agendar horário
  app.post('/api/agendar', async (req, res) => {
    try {
      const { professor_id, materia, tecnico, sala, dia, horario } = req.body;
      if (!professor_id || !materia || !sala || !dia || !horario) {
        return res.json({ sucesso: false, mensagem: 'Dados incompletos' });
      }
      await pool.query(
        'INSERT INTO agendamentos (professor_id, materia, tecnico, sala, dia, horario) VALUES (?, ?, ?, ?, ?, ?)',
        [professor_id, materia, tecnico ? 1 : 0, sala, dia, horario]
      );
      res.json({ sucesso: true });
    } catch (err) {
      if (err && err.code === 'ER_DUP_ENTRY') {
        return res.json({ sucesso: false, mensagem: 'Horário já agendado!' });
      }
      console.error(err);
      res.json({ sucesso: false, mensagem: 'Erro ao agendar' });
    }
  });

  // Pegar agendamentos
  app.get('/api/agendamentos/:professor_id', async (req, res) => {
    try {
      const [rows] = await pool.query('SELECT * FROM agendamentos');
      res.json({ sucesso: true, agendamentos: rows });
    } catch (err) {
      console.error(err);
      res.json({ sucesso: false, agendamentos: [] });
    }
  });

  // Mensagens do chat
  app.get('/api/chat/mensagens', async (req, res) => {
    try {
      const { user1, user2 } = req.query;
      const [rows] = await pool.query(
        `SELECT * FROM mensagens_chat 
         WHERE (remetente_id = ? AND destinatario_id = ?) OR (remetente_id = ? AND destinatario_id = ?)
         ORDER BY data_envio`,
        [user1, user2, user2, user1]
      );
      res.json({ sucesso: true, mensagens: rows });
    } catch (err) {
      console.error(err);
      res.json({ sucesso: false, mensagens: [] });
    }
  });

  // Enviar mensagem
  app.post('/api/chat/enviar', async (req, res) => {
    try {
      const { remetente_id, destinatario_id, mensagem } = req.body;
      if (!remetente_id || !destinatario_id || !mensagem) return res.json({ sucesso: false });
      await pool.query('INSERT INTO mensagens_chat (remetente_id, destinatario_id, mensagem) VALUES (?, ?, ?)', [
        remetente_id,
        destinatario_id,
        mensagem
      ]);
      res.json({ sucesso: true });
    } catch (err) {
      console.error(err);
      res.json({ sucesso: false });
    }
  });

  // Servir arquivos estáticos (opcional)
  app.use(express.static('public'));

  // Inicia o servidor Express
  app.listen(PORT, () => {
    console.log(`🚀 Servidor rodando em http://localhost:${PORT}`);
  });
})();

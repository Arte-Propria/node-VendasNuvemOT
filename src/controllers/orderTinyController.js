import { fetchLinkNote, fetchNoteOrderTiny, fetchOrderTiny } from "../services/orderTinyServices.js";

export const getOrderTiny = async (req, res) => {
  const { id, cpf } = req.params

  try {
    const order = await fetchOrderTiny(id, cpf)
    res.status(200).json(order);

  } catch (err) {
    console.error('Erro ao buscar pedido:', err);
    res.status(500).json({ error: 'Erro ao buscar pedido' });
  }
}

export const getNoteOrderTiny = async (req, res) => {
  const { id, cpf } = req.params

  try {
    const note = await fetchNoteOrderTiny(id, cpf)
    const linkNote = await fetchLinkNote(note.id)
    res.status(200).json(linkNote);

  } catch (err) {
    console.error('Erro ao buscar nota fiscal:', err);
    res.status(500).json({ error: 'Erro ao nota fiscal' });
  }
}
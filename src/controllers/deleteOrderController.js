import { deleteOrderFromDB } from "../services/deleteOrderServices.js";

export const deleteOrderByOwnerNote = async (req, res) => {
  const { ownerNote, store } = req.params; // Assume que o ownerNote vem no corpo da requisição

  if (!ownerNote) {
    return res.status(400).json({ error: 'ownerNote is required' });
  }

  const decodedOwnerNote = decodeURIComponent(ownerNote)

  try {
    const result = await deleteOrderFromDB(decodedOwnerNote, store);
    if (result.rowCount === 0) {
      return res.status(404).json({ error: 'Order not found' });
    }
    res.status(200).json({ message: 'Order deleted successfully' });
  } catch (err) {
    console.error('Error deleting order:', err);
    res.status(500).json({ error: 'Failed to delete order' });
  }
};

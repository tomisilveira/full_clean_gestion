import { Router } from 'express';
import { prisma } from '../db/prisma';
import { authenticateToken, requireRole } from '../middleware/auth';

const router = Router();

router.get('/', authenticateToken, async (req, res) => {
  try {
    const categories = await prisma.category.findMany({
      include: {
        _count: { select: { products: true } },
      },
      orderBy: { name: 'asc' },
    });
    return res.json(categories);
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
});

router.post('/', authenticateToken, requireRole(['ADMIN', 'VENDEDOR']), async (req, res) => {
  try {
    const { name, description } = req.body;
    if (!name) return res.status(400).json({ error: 'El nombre de la categoría es requerido.' });

    const category = await prisma.category.create({
      data: { name: name.trim(), description },
    });
    return res.status(201).json(category);
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
});

router.put('/:id', authenticateToken, requireRole(['ADMIN']), async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const { name, description } = req.body;

    const category = await prisma.category.update({
      where: { id },
      data: { name: name?.trim(), description },
    });
    return res.json(category);
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
});

router.delete('/:id', authenticateToken, requireRole(['ADMIN']), async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    await prisma.category.delete({ where: { id } });
    return res.json({ message: 'Categoría eliminada con éxito.' });
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
});

export default router;

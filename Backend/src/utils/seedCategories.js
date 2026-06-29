const Category = require('../models/Category');

const DEFAULT_CATEGORIES = [
  { name: 'Civil / RCC',    color: '#2563eb', description: 'Structural concrete, retaining walls, slabs' },
  { name: 'Finishing',      color: '#7c3aed', description: 'Plaster, paint, flooring, tiling' },
  { name: 'MEP',            color: '#16a85a', description: 'Mechanical, Electrical & Plumbing' },
  { name: 'Interior',       color: '#f37916', description: 'Furniture, false ceiling, joinery' },
  { name: 'External Works', color: '#0d9488', description: 'Landscaping, boundary walls, roads' },
  { name: 'Hospitality',    color: '#e03b3b', description: 'Pool, gym, restaurant, amenities' },
];

module.exports = async function seedCategories() {
  try {
    const count = await Category.countDocuments();
    if (count === 0) {
      await Category.insertMany(DEFAULT_CATEGORIES);
      console.log('✅  Default categories seeded');
    }
  } catch (err) {
    console.error('Category seed error:', err.message);
  }
};

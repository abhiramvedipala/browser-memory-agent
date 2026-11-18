import { h, type El } from '../dom.ts';
import type { DemoApp } from '../types.ts';
import { button, checkField, link, selectField, shell, textField } from '../ui.ts';

export interface Recipe {
  id: number;
  title: string;
  minutes: number;
  calories: number;
  diets: string[];
}

export const RECIPES: Recipe[] = [
  { id: 1, title: 'Tomato Basil Soup', minutes: 35, calories: 180, diets: ['vegetarian', 'vegan', 'gluten-free'] },
  { id: 2, title: 'Chicken Noodle Soup', minutes: 50, calories: 320, diets: [] },
  { id: 3, title: 'Lentil Soup', minutes: 45, calories: 260, diets: ['vegetarian', 'vegan', 'gluten-free'] },
  { id: 4, title: 'Creamy Mushroom Soup', minutes: 40, calories: 290, diets: ['vegetarian'] },
  { id: 5, title: 'Spaghetti Carbonara', minutes: 25, calories: 610, diets: [] },
  { id: 6, title: 'Vegan Pesto Pasta', minutes: 20, calories: 480, diets: ['vegetarian', 'vegan'] },
  { id: 7, title: 'Pasta Primavera', minutes: 30, calories: 440, diets: ['vegetarian'] },
  { id: 8, title: 'Gluten-Free Penne Arrabbiata', minutes: 28, calories: 410, diets: ['vegetarian', 'vegan', 'gluten-free'] },
  { id: 9, title: 'Quick Cucumber Salad', minutes: 10, calories: 90, diets: ['vegetarian', 'vegan', 'gluten-free'] },
  { id: 10, title: 'Greek Salad', minutes: 15, calories: 230, diets: ['vegetarian', 'gluten-free'] },
  { id: 11, title: 'Caesar Salad', minutes: 20, calories: 350, diets: [] },
  { id: 12, title: 'Warm Quinoa Salad', minutes: 30, calories: 310, diets: ['vegetarian', 'vegan', 'gluten-free'] },
];

const NAV = [{ id: 'rc.nav.home', href: '/', text: 'Home' }];

function page(main: (El | string)[]): El {
  return shell({ title: 'Recipe Box', base: '/recipes', navLinks: NAV, main });
}

export const recipes: DemoApp = {
  name: 'recipes',
  basePath: '/recipes',
  title: 'Recipe Box',
  handle(req) {
    const one = /^\/recipe\/(\d+)$/.exec(req.path);
    if (req.method === 'GET' && req.path === '/') {
      return {
        page: page([
          h('h1', {}, 'Recipe Box'),
          h(
            'form',
            { method: 'get', action: '/recipes/search', id: 'recipe-search' },
            h('div', { 'data-mut': 'reorder' }, textField('rc.q', 'q', 'Search recipes', { placeholder: 'soup, pasta, salad' })),
            h('div', { 'data-mut': 'movable' }, button('rc.search', 'Search')),
            h('div', { 'data-mut': 'slot' }),
          ),
        ]),
      };
    }
    if (req.method === 'GET' && req.path === '/search') {
      const q = (req.query.get('q') ?? '').trim().toLowerCase();
      const diets = req.query.getAll('diet');
      const sort = req.query.get('sort') ?? 'relevance';
      req.session.events.push({ type: 'recipe_search', data: { q, diets: [...diets].sort().join(','), sort } });
      let hits = RECIPES.filter((r) => (!q || r.title.toLowerCase().includes(q)) && diets.every((d) => r.diets.includes(d)));
      if (sort === 'time') hits = [...hits].sort((a, b) => a.minutes - b.minutes);
      if (sort === 'calories') hits = [...hits].sort((a, b) => a.calories - b.calories);
      return {
        page: page([
          h('h1', {}, 'Recipes'),
          h(
            'form',
            { method: 'get', action: '/recipes/search', id: 'recipe-filters' },
            h(
              'div',
              { 'data-mut': 'reorder' },
              textField('rc.f.q', 'q', 'Search recipes', { value: q }),
              h(
                'fieldset',
                {},
                h('legend', {}, 'Dietary needs'),
                h(
                  'div',
                  { 'data-mut': 'reorder' },
                  checkField('rc.diet.vegetarian', 'diet', 'vegetarian', 'Vegetarian', diets.includes('vegetarian')),
                  checkField('rc.diet.vegan', 'diet', 'vegan', 'Vegan', diets.includes('vegan')),
                  checkField('rc.diet.gf', 'diet', 'gluten-free', 'Gluten-free', diets.includes('gluten-free')),
                ),
              ),
              selectField('rc.sort', 'sort', 'Sort by', [['relevance', 'Relevance'], ['time', 'Cooking time'], ['calories', 'Calories']], sort),
            ),
            h('div', { 'data-mut': 'movable' }, button('rc.apply', 'Apply')),
            h('div', { 'data-mut': 'slot' }),
          ),
          h('p', {}, `${hits.length} recipe${hits.length === 1 ? '' : 's'}`),
          h(
            'ul',
            { class: 'list', 'data-mut': 'reorder' },
            hits.map((r) => h('li', {}, h('h3', {}, link(`rc.res.${r.id}`, `/recipes/recipe/${r.id}`, r.title)), h('p', {}, `${r.minutes} min | ${r.calories} kcal`))),
          ),
        ]),
      };
    }
    if (req.method === 'GET' && one) {
      const r = RECIPES.find((x) => x.id === Number(one[1]));
      if (!r) return undefined;
      req.session.events.push({ type: 'recipe_view', data: { recipeId: r.id } });
      return {
        page: page([
          h('h1', {}, r.title),
          h('p', {}, `${r.minutes} minutes, ${r.calories} kcal. Diets: ${r.diets.join(', ') || 'none'}.`),
          h('p', {}, link('rc.back', '/recipes/search?q=', 'Back to recipes')),
        ]),
      };
    }
    return undefined;
  },
};

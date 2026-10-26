// Small React app without a build step, used to check that the picker
// reports React component names.
const h = React.createElement;

function PriceCard({ plan, price }) {
  return h('div', { className: 'price-card' },
    h('div', { className: 'plan' }, plan),
    h('div', { className: 'price' }, price),
    h('button', { className: 'choose' }, 'Choose'));
}

function PricingTable() {
  return h('div', { className: 'cards' },
    h(PriceCard, { plan: 'Starter', price: '$9' }),
    h(PriceCard, { plan: 'Team', price: '$29' }),
    h(PriceCard, { plan: 'Enterprise', price: 'contact us' }));
}

ReactDOM.createRoot(document.getElementById('react-root')).render(h(PricingTable));

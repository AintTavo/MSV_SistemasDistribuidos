const abilityMod = (score) => Math.floor((Number(score) - 10) / 2);
const rollDie = (sides) => Math.floor(Math.random() * sides) + 1;
module.exports = { abilityMod, rollDie };

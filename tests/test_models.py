import pytest
from pydantic import ValidationError
from bot import GastoInput, PagamentoInput

def test_gasto_input_valid():
    gasto = GastoInput(descricao="Almoço", valor=25.50, parcelas=1)
    assert gasto.descricao == "Almoço"
    assert gasto.valor == pytest.approx(25.50)
    assert gasto.parcelas == 1

def test_gasto_input_invalid_valor():
    with pytest.raises(ValidationError):
        GastoInput(descricao="Teste", valor=-10, parcelas=1)

def test_gasto_input_invalid_parcelas():
    with pytest.raises(ValidationError):
        GastoInput(descricao="Teste", valor=10, parcelas=0)

def test_gasto_input_parcelas_too_high():
    with pytest.raises(ValidationError):
        GastoInput(descricao="Teste", valor=100, parcelas=70)

def test_pagamento_input_valid():
    pagamento = PagamentoInput(valor=150.0, descricao="Pagamento fatura")
    assert pagamento.valor == pytest.approx(150.0)
    assert pagamento.descricao == "Pagamento fatura"

def test_pagamento_input_valid_no_descricao():
    pagamento = PagamentoInput(valor=200.0)
    assert pagamento.valor == pytest.approx(200.0)
    assert pagamento.descricao is None

def test_pagamento_input_invalid_valor():
    with pytest.raises(ValidationError):
        PagamentoInput(valor=0, descricao="Teste")

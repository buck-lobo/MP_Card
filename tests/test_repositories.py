import pytest
from moto.firestore import mock_firestore
from bot import UserRepository, GastoRepository, COLLECTION_USUARIOS, COLLECTION_GASTOS
from firebase_admin import firestore

@mock_firestore
def test_user_repository_registrar_usuario():
    db = firestore.client()
    repo = UserRepository(db)
    
    repo.registrar_usuario(123, "Test User", "testuser")
    
    user_ref = db.collection(COLLECTION_USUARIOS).document("123")
    user_doc = user_ref.get()
    assert user_doc.exists
    data = user_doc.to_dict()
    assert data["name"] == "Test User"
    assert data["username"] == "testuser"
    assert data["ativo"] == True

@mock_firestore
def test_user_repository_usuario_autorizado_admin():
    db = firestore.client()
    repo = UserRepository(db)
    
    # Assuming 123 is admin
    assert repo.usuario_autorizado(123) == True  # Since is_admin checks ADMIN_IDS

@mock_firestore
def test_gasto_repository_adicionar_gasto():
    db = firestore.client()
    repo = GastoRepository(db)
    
    gasto_id = repo.adicionar_gasto(123, "Test Gasto", 100.0, 2)
    
    assert gasto_id.startswith("123_")
    
    gastos = repo.obter_gastos_usuario(123)
    assert len(gastos) == 1
    assert gastos[0]["descricao"] == "Test Gasto"
    assert gastos[0]["valor_total"] == pytest.approx(100.0)
    assert gastos[0]["parcelas_total"] == 2

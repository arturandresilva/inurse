import unittest
from supplier_pdf import expand_sizes, clean_size, money_cents, category_for, page_vat_notes


class TestTamanhos(unittest.TestCase):
    def test_intervalos(self):
        self.assertEqual(expand_sizes("35 a 46"), [str(x) for x in range(35, 47)])
        self.assertEqual(expand_sizes("39-44"), [str(x) for x in range(39, 45)])
        self.assertEqual(expand_sizes("35/6 a 47/8"), ["35/36", "37/38", "39/40", "41/42", "43/44", "45/46", "47/48"])
        self.assertEqual(expand_sizes("34/5 a 42"), ["34/35"] + [str(x) for x in range(36, 43)])
        self.assertEqual(expand_sizes("1 a 5"), ["1", "2", "3", "4", "5"])
        self.assertEqual(expand_sizes("S,M,L"), ["S", "M", "L"])
        self.assertEqual(expand_sizes(""), ["Único"])
        self.assertEqual(expand_sizes("75 ml"), ["Único"])

    def test_texto_invadido(self):
        self.assertEqual(clean_size("Cla4r0o a 46"), "40 a 46")
        self.assertEqual(clean_size("o 35/6 a 47/8"), "35/6 a 47/8")


class TestPrecos(unittest.TestCase):
    def test_euros(self):
        self.assertEqual(money_cents("32,70 €"), 3270)
        self.assertEqual(money_cents("1.234,50 €"), 123450)
        self.assertIsNone(money_cents(""))


class TestCategorias(unittest.TestCase):
    def test_categorias(self):
        self.assertEqual(category_for("CLOG Soca hospitalar"), "CALÇADO>SOCAS")      # "hospitalar" contém "tala"
        self.assertEqual(category_for("Palmilha Breelite"), "ACESSÓRIOS>CUIDADOS DOS PÉS")
        self.assertEqual(category_for("Meia Descanso Lycra"), "MEIAS")
        self.assertEqual(category_for("ÂMBAR Ténis profissional"), "CALÇADO>SAPATILHAS")

    def test_notas_iva(self):
        self.assertEqual(page_vat_notes("(1) - IVA 6%  (2) Taxa IVA 23%"), {"1": 6, "2": 23})


if __name__ == "__main__":
    unittest.main()

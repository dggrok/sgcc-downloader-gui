import unittest

from sgcc_gui.core.api_client import SGCCApiClient

class ApiClientTestCase(unittest.TestCase):
    def test_parse_org_nodes_supports_nested_result_value(self) -> None:
        client = SGCCApiClient()
        data = {
            "resultValue": {
                "children": [
                    {"orgId": "1001", "orgName": "国网湖北省电力有限公司", "childFlag": True},
                    {"orgId": "1002", "orgName": "国网上海市电力公司", "leaf": True},
                ]
            }
        }

        nodes = client._parse_org_nodes(data)

        self.assertEqual(len(nodes), 2)
        self.assertEqual(nodes[0].id, "1001")
        self.assertTrue(nodes[0].has_children)
        self.assertEqual(nodes[1].id, "1002")
        self.assertFalse(nodes[1].has_children)


if __name__ == "__main__":
    unittest.main()

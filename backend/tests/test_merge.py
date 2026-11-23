import copy

from f1live.merge import as_list, merge, merge_delta


def test_nested_dict_merge_keeps_untouched_keys():
    state = {"Lines": {"1": {"Position": "1", "GapToLeader": "LAP 3"}, "44": {"Position": "2"}}}
    merge(state, {"Lines": {"44": {"GapToLeader": "+1.2"}}})
    assert state == {"Lines": {"1": {"Position": "1", "GapToLeader": "LAP 3"},
                               "44": {"Position": "2", "GapToLeader": "+1.2"}}}


def test_index_keyed_update_patches_list_element():
    state = {"Sectors": [{"Value": "30.1"}, {"Value": ""}, {"Value": ""}]}
    merge(state, {"Sectors": {"1": {"Value": "29.9", "PersonalFastest": True}}})
    assert state["Sectors"][0] == {"Value": "30.1"}
    assert state["Sectors"][1] == {"Value": "29.9", "PersonalFastest": True}
    assert isinstance(state["Sectors"], list)


def test_index_keyed_update_appends_to_list():
    state = {"Messages": [{"Message": "a"}]}
    merge(state, {"Messages": {"1": {"Message": "b"}}})
    merge(state, {"Messages": {"2": {"Message": "c"}, "3": {"Message": "d"}}})
    assert [m["Message"] for m in state["Messages"]] == ["a", "b", "c", "d"]


def test_out_of_order_index_pads_list():
    state = {"Stints": []}
    merge(state, {"Stints": {"2": {"Compound": "HARD"}}})
    assert state["Stints"] == [None, None, {"Compound": "HARD"}]
    merge(state, {"Stints": {"0": {"Compound": "SOFT"}}})
    assert state["Stints"][0] == {"Compound": "SOFT"}


def test_digit_keyed_dicts_stay_dicts():
    # Racing numbers are digit strings; DriverList must never become a list.
    state = {}
    merge(state, {"DriverList": {"1": {"Tla": "AAA"}, "44": {"Tla": "BBB"}}})
    merge(state, {"DriverList": {"44": {"Line": 1}}})
    assert state["DriverList"] == {"1": {"Tla": "AAA"}, "44": {"Tla": "BBB", "Line": 1}}


def test_scalar_and_type_mismatch_replace():
    state = {"a": {"b": 1}, "c": 5}
    merge(state, {"a": "now a string", "c": {"d": 1}})
    assert state == {"a": "now a string", "c": {"d": 1}}


def test_full_list_replaces_list():
    state = {"Stints": [{"Compound": "SOFT"}]}
    merge(state, {"Stints": [{"Compound": "HARD"}, {"Compound": "MEDIUM"}]})
    assert state["Stints"] == [{"Compound": "HARD"}, {"Compound": "MEDIUM"}]


def test_deleted_and_keyframe_markers():
    state = {"Lines": {"1": {"x": 1}, "2": {"x": 2}}, "L": [1, 2, 3]}
    merge(state, {"Lines": {"_deleted": ["2"]}, "L": {"_deleted": [0]}, "_kf": True})
    assert state == {"Lines": {"1": {"x": 1}}, "L": [2, 3]}


def test_merge_does_not_alias_update():
    update = {"Lines": {"1": {"Sectors": [{"Value": "1"}]}}}
    state = {}
    merge(state, update)
    state["Lines"]["1"]["Sectors"][0]["Value"] = "changed"
    assert update["Lines"]["1"]["Sectors"][0]["Value"] == "1"


def test_merge_delta_coalesces_like_sequential_merges():
    base = {"Lines": {"1": {"Sectors": [{"Value": ""}, {"Value": ""}, {"Value": ""}]}}}
    d1 = {"Lines": {"1": {"Sectors": {"0": {"Value": "30.0"}}}}}
    d2 = {"Lines": {"1": {"Sectors": {"1": {"Value": "31.0"}}, "Position": "3"}}}
    sequential = merge(copy.deepcopy(base), d1)
    sequential = merge(sequential, d2)
    combined = merge_delta(copy.deepcopy(d1), d2)
    assert merge(copy.deepcopy(base), combined) == sequential


def test_merge_delta_full_list_then_patch():
    delta = merge_delta({"Messages": [{"m": "a"}]}, {"Messages": {"1": {"m": "b"}}})
    assert delta == {"Messages": [{"m": "a"}, {"m": "b"}]}


def test_as_list():
    assert as_list([1, 2]) == [1, 2]
    assert as_list({"1": "b", "0": "a", "10": "c"}) == ["a", "b", "c"]
    assert as_list(None) == []

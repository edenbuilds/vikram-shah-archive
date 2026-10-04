import ocr_quality as q

GOOD = "The Complainant states that the Respondent signed the Agreement for Sale dated 05.03.2024 and has failed to hand over possession of the flat.\n" * 6
RAGGED = "\n".join("fo ro tt SS lo n fl OP tin yr S fas m".split()) * 3  # one short token per line, like the Faheem page 6 read
NOISE = "xqzv jkwp bnmt rrtq lkjh vvcx zzqw mnbv ppoi uytr qwer asdf zxcv poiu lkjh mnbv\n" * 3


def test_a_normal_page_is_not_poor():
    assert not q.poor(GOOD)


def test_ragged_one_word_lines_are_poor():
    assert q.poor(RAGGED)


def test_letter_noise_is_poor():
    assert q.poor(NOISE)


def test_a_short_stamp_page_is_left_alone():
    assert not q.poor("Received\nRegistry\n05-03-2024")


def test_a_better_read_scores_higher():
    assert q.score(GOOD) > q.score(RAGGED) and q.score(GOOD) > q.score(NOISE)

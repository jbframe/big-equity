from simulation import simulate_board


hero_hand = ['ad', '5d', '4s', 'ks', '10c']
villain_hand = ['ah', 'ac', 'kd', '4c', '2h']

# No board cards
board = ['3s', '9d', 'js']
print(f'hero_hand: {hero_hand}')
print(f'villain_hand: {villain_hand}')
print(f'board: {board}')
simulate_board(hero_hand, villain_hand, board)

# No board cards
board = ['3s', '8d', 'jc']
print(f'hero_hand: {hero_hand}')
print(f'villain_hand: {villain_hand}')
print(f'board: {board}')
simulate_board(hero_hand, villain_hand, board)


# hero_hand = ['ad', 'ah', 'qd', 'jc', '2h']
# villain_hand = ['as', '2c', '5c', '7s', 'ac']

# No board cards
# board=[]
# print(f'hero_hand: {hero_hand}')
# print(f'villain_hand: {villain_hand}')
# print(f'board: {board}')
# simulate_board(hero_hand, villain_hand, board)


# hero_hand = ['ad', 'ac', 'qd', '2d']
# villain_hand = ['as', '2c', '5c', '7s']

# # No board cards
# board=[]
# print(f'hero_hand: {hero_hand}')
# print(f'villain_hand: {villain_hand}')
# print(f'board: {board}')
# simulate_board(hero_hand, villain_hand, board)

# hero_hand = ['ad', 'ac', 'qd', '2d']
# villain_hand = ['as', '2c', '5c', '10s']

# # No board cards
# board=[]
# print(f'hero_hand: {hero_hand}')
# print(f'villain_hand: {villain_hand}')
# print(f'board: {board}')
# simulate_board(hero_hand, villain_hand, board)


# hero_hand = ['ad', 'ac', 'qd', '2d']
# villain_hand = ['as', '2c', '9c', '10s']

# # No board cards
# board=[]
# print(f'hero_hand: {hero_hand}')
# print(f'villain_hand: {villain_hand}')
# print(f'board: {board}')
# simulate_board(hero_hand, villain_hand, board)
